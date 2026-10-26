// OllupiClient is one initialized gateway connection with the protocol's
// maps applied: `call` is typed per method, `on` per notification and
// `handle` per server request. It does not reconnect; whoever owns the
// connection decides when to open another.

import {
  ErrorCode,
  type ClientInfo,
  type ClientMethods,
  type ClientNotifications,
  type ServerInfo,
  type ServerNotifications,
  type ServerRequests,
} from '@ollupi/protocol'
import { RpcError, RpcPeer } from './peer'
import { connectWebSocket, type Transport, type WebSocketFactory } from './transport'

/** Sees every message with the method it belongs to, e.g. to check traffic
 * against the contract. Received means from the gateway. */
export interface Inspector {
  sent(kind: 'params' | 'notification' | 'response', method: string, payload: unknown): void
  received(kind: 'result' | 'notification' | 'request', method: string, payload: unknown): void
}

export interface ConnectOptions {
  /** Gateway URL, e.g. ws://127.0.0.1:1234/ */
  url: string
  token: string
  clientInfo: ClientInfo
  inspector?: Inspector
  webSocket?: WebSocketFactory
}

type Method = keyof ClientMethods
type Notification = keyof ServerNotifications
type Request = keyof ServerRequests

export class OllupiClient {
  private readonly listeners = new Map<string, Set<(params: any) => void>>()
  private readonly handlers = new Map<string, (params: any) => Promise<unknown>>()
  private readonly peer: RpcPeer
  serverInfo: ServerInfo = { name: '', version: '' }
  /** The sha256 of the contract the gateway serves (initialize). */
  protocolSha256 = ''

  /** Opens a WebSocket to the gateway (a browser cannot set the
   * Authorization header, so the token goes in the query) and initializes. */
  static async connect(opts: ConnectOptions): Promise<OllupiClient> {
    const url = new URL(opts.url)
    url.searchParams.set('token', opts.token)
    return OllupiClient.over(await connectWebSocket(url.toString(), opts.webSocket), opts.clientInfo, opts.inspector)
  }

  /** Initializes over an open transport: initialize, then the initialized
   * notification, after which the gateway sends events and re-sends every
   * pending request. */
  static async over(transport: Transport, clientInfo: ClientInfo, inspector?: Inspector): Promise<OllupiClient> {
    const client = new OllupiClient(transport, inspector)
    try {
      const { serverInfo, protocolSha256 } = await client.call('initialize', { clientInfo })
      client.serverInfo = serverInfo
      client.protocolSha256 = protocolSha256
      client.notify('initialized', {})
    } catch (err) {
      client.close()
      throw err
    }
    return client
  }

  private constructor(
    transport: Transport,
    private readonly inspector?: Inspector,
  ) {
    this.peer = new RpcPeer(transport, {
      notification: (method, params) => {
        inspector?.received('notification', method, params)
        for (const l of this.listeners.get(method) ?? []) l(params)
      },
      request: async (method, params) => {
        inspector?.received('request', method, params)
        const handler = this.handlers.get(method)
        if (!handler) throw new RpcError(ErrorCode.methodNotFound, `no handler for ${method}`)
        const result = await handler(params)
        inspector?.sent('response', method, result)
        return result
      },
    })
  }

  async call<M extends Method>(method: M, params: ClientMethods[M]['params']): Promise<ClientMethods[M]['result']> {
    this.inspector?.sent('params', method, params)
    const result = (await this.peer.call(method, params)) as ClientMethods[M]['result']
    this.inspector?.received('result', method, result)
    return result
  }

  private notify<N extends keyof ClientNotifications>(method: N, params: ClientNotifications[N]): void {
    this.inspector?.sent('notification', method, params)
    this.peer.notify(method, params)
  }

  on<N extends Notification>(method: N, listener: (params: ServerNotifications[N]) => void): () => void {
    let set = this.listeners.get(method)
    if (!set) this.listeners.set(method, (set = new Set()))
    set.add(listener)
    return () => set.delete(listener)
  }

  /** Answers a server request; one handler per method. */
  handle<R extends Request>(method: R, handler: (params: ServerRequests[R]['params']) => Promise<ServerRequests[R]['result']>): () => void {
    this.handlers.set(method, handler)
    return () => {
      if (this.handlers.get(method) === handler) this.handlers.delete(method)
    }
  }

  onClose(listener: (reason: string) => void): () => void {
    return this.peer.onClose(listener)
  }

  get isClosed(): boolean {
    return this.peer.isClosed
  }

  close(): void {
    this.peer.close()
  }
}
