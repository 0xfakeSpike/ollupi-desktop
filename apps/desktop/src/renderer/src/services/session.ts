// The session owns the gateway connection for the renderer's lifetime. It
// follows the backend state reported by the main process: connect when the
// backend is ready, reconnect with backoff when the socket drops, and start
// over (new URL and token) when the backend restarts.

import { errorMessage, OllupiClient } from '@ollupi/client'
import type { BackendState } from '../../../shared/ipc'
import { useConnection } from '../stores/connection'
import { useRequests } from '../stores/requests'
import { bindClient } from './bridge'
import { desktop } from './desktop'
import { syncAll } from './sync'

type ReadyBackend = Extract<BackendState, { status: 'ready' }>

const CLIENT_INFO = { name: 'ollupi-desktop', version: '0.1.0' }
const MAX_BACKOFF_MS = 5000

class Session {
  private client: OllupiClient | undefined
  private unbind: (() => void) | undefined
  /** Bumped whenever the backend changes, cancelling older connect loops. */
  private epoch = 0
  private started = false

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    desktop.backend.onState((state) => this.onBackend(state))
    this.onBackend(await desktop.backend.state())
  }

  /** The live client; actions call this and surface the error if offline. */
  current(): OllupiClient {
    if (!this.client || this.client.isClosed) throw new Error('Not connected to the backend')
    return this.client
  }

  private onBackend(state: BackendState): void {
    useConnection.getState().setBackend(state)
    const epoch = ++this.epoch
    this.drop()
    if (state.status === 'ready') void this.connect(state, epoch, 'connecting')
    else useConnection.getState().setGateway('idle')
  }

  private async connect(backend: ReadyBackend, epoch: number, status: 'connecting' | 'reconnecting'): Promise<void> {
    const conn = useConnection.getState()
    for (let attempt = 0; epoch === this.epoch; attempt++) {
      conn.setGateway(status, conn.lastError)
      try {
        const client = await OllupiClient.connect({ url: backend.url, token: backend.token, clientInfo: CLIENT_INFO })
        if (epoch !== this.epoch) return client.close()
        this.attach(client, backend, epoch)
        conn.setServerVersion(client.serverInfo.version)
        await syncAll(client)
        conn.setGateway('connected')
        return
      } catch (err) {
        if (epoch !== this.epoch) return
        this.drop()
        status = 'reconnecting'
        conn.setGateway(status, errorMessage(err))
        await sleep(Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt))
      }
    }
  }

  private attach(client: OllupiClient, backend: ReadyBackend, epoch: number): void {
    this.client = client
    this.unbind = bindClient(client)
    client.onClose((reason) => {
      if (this.client !== client) return
      this.drop()
      if (epoch !== this.epoch) return
      useConnection.getState().setGateway('reconnecting', reason)
      void this.connect(backend, epoch, 'reconnecting')
    })
  }

  private drop(): void {
    const client = this.client
    this.client = undefined
    this.unbind?.()
    this.unbind = undefined
    client?.close()
    useRequests.getState().clear()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const session = new Session()
