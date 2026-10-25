// OllupiClient is one initialized gateway connection with the protocol's
// method maps applied: `call` is typed per method, `on` per notification and
// `handle` per server request. It does not reconnect; whoever owns the
// connection decides when to open a new one.

import type {
  ClientMethod,
  ClientMethods,
  ServerNotification,
  ServerNotifications,
  ServerRequest,
  ServerRequests,
} from '@ollupi/protocol'
import { RpcError, RpcPeer } from './rpc'
import { connectWebSocket, type Transport, type WebSocketFactory } from './transport'

export interface ConnectOptions {
  /** Gateway URL, e.g. ws://127.0.0.1:1234/ */
  url: string
  token: string
  clientInfo: { name: string; version: string }
  webSocket?: WebSocketFactory
}

type NotificationListener<N extends ServerNotification> = (params: ServerNotifications[N]) => void
type RequestHandlerOf<R extends ServerRequest> = (
  params: ServerRequests[R]['params'],
) => Promise<ServerRequests[R]['result']>

export class OllupiClient {
  private readonly listeners = new Map<string, Set<(params: any) => void>>()
  private readonly handlers = new Map<string, (params: any) => Promise<unknown>>()
  private readonly peer: RpcPeer
  serverInfo: { name: string; version: string } = { name: '', version: '' }

  static async connect(opts: ConnectOptions): Promise<OllupiClient> {
    const url = new URL(opts.url)
    url.searchParams.set('token', opts.token)
    const transport = await connectWebSocket(url.toString(), opts.webSocket)
    return OllupiClient.over(transport, opts.clientInfo)
  }

  /** Initializes a client over an already open transport. */
  static async over(transport: Transport, clientInfo: ConnectOptions['clientInfo']): Promise<OllupiClient> {
    const client = new OllupiClient(transport)
    try {
      const { serverInfo } = await client.call('initialize', { clientInfo })
      client.serverInfo = serverInfo
      client.peer.notify('initialized')
    } catch (err) {
      client.close()
      throw err
    }
    return client
  }

  private constructor(transport: Transport) {
    this.peer = new RpcPeer(
      transport,
      (method, params) => this.listeners.get(method)?.forEach((l) => l(params)),
      (method, params) => {
        const handler = this.handlers.get(method)
        if (!handler) return Promise.reject(new RpcError(-32601, `no handler for ${method}`))
        return handler(params)
      },
    )
  }

  call<M extends ClientMethod>(
    method: M,
    params: ClientMethods[M]['params'],
  ): Promise<ClientMethods[M]['result']> {
    return this.peer.call(method, params) as Promise<ClientMethods[M]['result']>
  }

  on<N extends ServerNotification>(method: N, listener: NotificationListener<N>): () => void {
    let set = this.listeners.get(method)
    if (!set) this.listeners.set(method, (set = new Set()))
    set.add(listener)
    return () => set.delete(listener)
  }

  /** Answers a server request; one handler per method. */
  handle<R extends ServerRequest>(method: R, handler: RequestHandlerOf<R>): () => void {
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
