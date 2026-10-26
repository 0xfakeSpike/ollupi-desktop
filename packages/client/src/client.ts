// OllupiClient is one initialized gateway connection with the protocol's
// maps applied: `call` is typed per method, `on` per notification and
// `handle` per server request. It does not reconnect; whoever owns the
// connection decides when to open another.

import {
  ErrorCode,
  type ClientMethods,
  type ServerNotifications,
  type ServerRequests,
} from '@ollupi/protocol'
import { RpcError, RpcPeer } from './peer'
import { connectWebSocket, type Transport, type WebSocketFactory } from './transport'

export interface ClientInfo {
  name: string
  version: string
}

export interface ConnectOptions {
  /** Gateway URL, e.g. ws://127.0.0.1:1234/ */
  url: string
  token: string
  clientInfo: ClientInfo
  webSocket?: WebSocketFactory
}

type Method = keyof ClientMethods
type Notification = keyof ServerNotifications
type Request = keyof ServerRequests

export class OllupiClient {
  private readonly listeners = new Map<string, Set<(params: any) => void>>()
  private readonly handlers = new Map<string, (params: any) => Promise<unknown>>()
  private readonly peer: RpcPeer
  serverInfo: ClientInfo = { name: '', version: '' }

  /** Opens a WebSocket to the gateway (a browser cannot set the
   * Authorization header, so the token goes in the query) and initializes. */
  static async connect(opts: ConnectOptions): Promise<OllupiClient> {
    const url = new URL(opts.url)
    url.searchParams.set('token', opts.token)
    return OllupiClient.over(await connectWebSocket(url.toString(), opts.webSocket), opts.clientInfo)
  }

  /** Initializes over an open transport: initialize, then the initialized
   * notification, after which the gateway starts sending events and
   * re-sends every pending request. */
  static async over(transport: Transport, clientInfo: ClientInfo): Promise<OllupiClient> {
    const client = new OllupiClient(transport)
    try {
      const { serverInfo } = await client.call('initialize', { clientInfo })
      client.serverInfo = serverInfo
      client.peer.notify('initialized', {})
    } catch (err) {
      client.close()
      throw err
    }
    return client
  }

  private constructor(transport: Transport) {
    this.peer = new RpcPeer(transport, {
      notification: (method, params) => {
        for (const l of this.listeners.get(method) ?? []) l(params)
      },
      request: (method, params) => {
        const handler = this.handlers.get(method)
        if (!handler) return Promise.reject(new RpcError(ErrorCode.MethodNotFound, `no handler for ${method}`))
        return handler(params)
      },
    })
  }

  call<M extends Method>(method: M, params: ClientMethods[M]['params']): Promise<ClientMethods[M]['result']> {
    return this.peer.call(method, params) as Promise<ClientMethods[M]['result']>
  }

  on<N extends Notification>(method: N, listener: (params: ServerNotifications[N]) => void): () => void {
    let set = this.listeners.get(method)
    if (!set) this.listeners.set(method, (set = new Set()))
    set.add(listener)
    return () => set.delete(listener)
  }

  /** Answers a server request; one handler per method. */
  handle<R extends Request>(
    method: R,
    handler: (params: ServerRequests[R]['params']) => Promise<ServerRequests[R]['result']>,
  ): () => void {
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
