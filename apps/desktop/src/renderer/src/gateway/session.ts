// The session keeps the renderer connected to the gateway: it follows the
// backend state the main process reports, connects when the backend is
// ready, reconnects with backoff when the socket drops, and starts over with
// the new address and token when the backend restarts. On every connection
// it binds each domain, then has each sync; when the connection ends each
// domain drops what only held for it.

import { errorMessage, OllupiClient, type Inspector } from '@ollupi/client'
import { PROTOCOL_SHA256 } from '@ollupi/protocol'
import type { BackendState } from '../../../shared/ipc'
import { conversationDomain } from '../domains/conversation'
import { cronDomain } from '../domains/cron'
import { modelsDomain } from '../domains/models'
import { requestsDomain } from '../domains/requests'
import { settingsDomain } from '../domains/settings'
import { threadsDomain } from '../domains/threads'
import { toolsDomain } from '../domains/tools'
import { workspacesDomain } from '../domains/workspaces'
import { desktop } from '../platform/desktop'
import { setClient, useConnection } from './connection'
import type { Domain } from './domain'

type ReadyBackend = Extract<BackendState, { status: 'ready' }>

// Sync runs in this order: threads are listed per workspace, so workspaces
// come first.
const domains: Domain[] = [workspacesDomain, threadsDomain, conversationDomain, requestsDomain, modelsDomain, toolsDomain, cronDomain, settingsDomain]
const CLIENT_INFO = { name: 'ollupi-desktop', version: '0.2.0' }
const MAX_BACKOFF_MS = 5000

let current: { client: OllupiClient; unbind: () => void } | undefined
/** Bumped on every backend change; a connect loop from an older epoch stops. */
let epoch = 0
let started = false

export async function startSession(): Promise<void> {
  if (started) return
  started = true
  desktop.backend.onState(onBackend)
  onBackend(await desktop.backend.state())
}

function onBackend(state: BackendState): void {
  useConnection.setState({ backend: state })
  const mine = ++epoch
  drop()
  if (state.status === 'ready') void connect(state, mine, 'connecting')
  else useConnection.setState({ gateway: 'idle' })
}

// Dev builds check every message against the contract (gateway/contract.ts).
const inspector: Promise<Inspector | undefined> = import.meta.env.DEV
  ? import('./contract').then((m) => m.contractInspector())
  : Promise.resolve(undefined)

async function connect(backend: ReadyBackend, mine: number, status: 'connecting' | 'reconnecting'): Promise<void> {
  for (let attempt = 0; mine === epoch; attempt++) {
    useConnection.setState({ gateway: status })
    try {
      const client = await OllupiClient.connect({ url: backend.url, token: backend.token, clientInfo: CLIENT_INFO, inspector: await inspector })
      if (mine !== epoch) return client.close()
      const server = client.protocolSha256
      useConnection.setState({ contractMismatch: server === PROTOCOL_SHA256 ? undefined : { server, ui: PROTOCOL_SHA256 } })
      attach(client, backend, mine)
      for (const d of domains) await d.sync?.(client)
      useConnection.setState({ gateway: 'connected', lastError: undefined, serverVersion: client.serverInfo.version, synced: true })
      return
    } catch (err) {
      if (mine !== epoch) return
      drop()
      status = 'reconnecting'
      useConnection.setState({ gateway: status, lastError: errorMessage(err) })
      await new Promise((r) => setTimeout(r, Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt)))
    }
  }
}

function attach(client: OllupiClient, backend: ReadyBackend, mine: number): void {
  const unbinds = domains.map((d) => d.bind?.(client) ?? (() => {}))
  current = { client, unbind: () => unbinds.forEach((u) => u()) }
  setClient(client)
  client.onClose((reason) => {
    if (current?.client !== client) return
    drop()
    if (mine !== epoch) return
    useConnection.setState({ gateway: 'reconnecting', lastError: reason })
    void connect(backend, mine, 'reconnecting')
  })
}

function drop(): void {
  const c = current
  if (!c) return
  current = undefined
  setClient(undefined)
  c.unbind()
  c.client.close()
  for (const d of domains) d.disconnect?.()
}
