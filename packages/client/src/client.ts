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

/** The reads whose result carries the commit they were read at. */
type SnapshotMethod = { [M in Method]: ClientMethods[M]['result'] extends { seq: number } ? M : never }[Method]

/** A notification with its method, so a union of them can be told apart. */
export type NotificationEvent<N extends Notification = Notification> = { [K in N]: { method: K; params: ServerNotifications[K] } }[N]

export class OllupiClient {
  private readonly listeners = new Map<string, Set<(params: any) => void>>()
  private readonly handlers = new Map<string, (params: any) => Promise<unknown>>()
  private readonly peer: RpcPeer
  serverInfo: ServerInfo = { name: '', version: '' }
  /** The sha256 of the contract the gateway serves (initialize). */
  protocolSha256 = ''

  /** Opens a WebSocket to the gateway and initializes. */
  static async connect(opts: ConnectOptions): Promise<OllupiClient> {
    return OllupiClient.over(await connectWebSocket(opts.url, opts.token, opts.webSocket), opts.clientInfo, opts.inspector)
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

  /** Calls a read whose result carries the seq of the commit it was read
   * at, and gives with it the watched notifications that arrived while it
   * was on its way and are newer than that: the gateway may send a later
   * commit's change before an older read's reply. Whoever replaces what
   * they hold with the result applies these after it. A notification
   * without a seq (streamed text) is always given. */
  async snapshot<M extends SnapshotMethod, N extends Notification>(
    method: M,
    params: ClientMethods[M]['params'],
    watched: readonly N[],
  ): Promise<{ result: ClientMethods[M]['result']; newer: NotificationEvent<N>[] }> {
    const caught: NotificationEvent<N>[] = []
    const offs = watched.map((n) => this.on(n, (params) => caught.push({ method: n, params } as NotificationEvent<N>)))
    try {
      const result = await this.call(method, params)
      const { seq } = result as { seq: number }
      const newer = caught.filter((e) => {
        const at = (e.params as { seq?: number }).seq
        return at === undefined || at > seq
      })
      return { result, newer }
    } finally {
      offs.forEach((off) => off())
    }
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
