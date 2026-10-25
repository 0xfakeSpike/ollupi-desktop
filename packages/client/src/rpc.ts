// A JSON-RPC 2.0 peer over a Transport: both sides may call, notify and
// answer. It is untyped on purpose; OllupiClient layers the protocol's method
// maps on top.

import type { Transport } from './transport'

type Id = number | string

interface Message {
  jsonrpc: '2.0'
  id?: Id
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

export class ConnectionClosedError extends Error {
  constructor(reason: string) {
    super(`connection closed: ${reason}`)
    this.name = 'ConnectionClosedError'
  }
}

export type NotificationHandler = (method: string, params: unknown) => void
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>

export class RpcPeer {
  private nextId = 1
  private readonly pending = new Map<Id, { resolve(v: unknown): void; reject(e: Error): void }>()
  private closedReason: string | undefined
  private readonly closeListeners = new Set<(reason: string) => void>()

  constructor(
    private readonly transport: Transport,
    private readonly onNotification: NotificationHandler,
    private readonly onRequest: RequestHandler,
  ) {
    transport.listen({
      message: (text) => this.receive(text),
      close: (reason) => this.closed(reason),
    })
  }

  get isClosed(): boolean {
    return this.closedReason !== undefined
  }

  call(method: string, params: unknown): Promise<unknown> {
    if (this.closedReason !== undefined) {
      return Promise.reject(new ConnectionClosedError(this.closedReason))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  close(): void {
    this.transport.close()
    this.closed('client closed')
  }

  private send(m: Message): void {
    this.transport.send(JSON.stringify(m))
  }

  private receive(text: string): void {
    let m: Message
    try {
      m = JSON.parse(text) as Message
    } catch {
      return
    }
    if (m.method !== undefined && m.id !== undefined) {
      void this.answer(m.id, m.method, m.params)
    } else if (m.method !== undefined) {
      this.onNotification(m.method, m.params)
    } else if (m.id !== undefined) {
      const waiter = this.pending.get(m.id)
      if (!waiter) return
      this.pending.delete(m.id)
      if (m.error) waiter.reject(new RpcError(m.error.code, m.error.message))
      else waiter.resolve(m.result)
    }
  }

  private async answer(id: Id, method: string, params: unknown): Promise<void> {
    try {
      const result = await this.onRequest(method, params)
      this.send({ jsonrpc: '2.0', id, result: result ?? {} })
    } catch (err) {
      const code = err instanceof RpcError ? err.code : -32603
      this.send({ jsonrpc: '2.0', id, error: { code, message: errorMessage(err) } })
    }
  }

  private closed(reason: string): void {
    if (this.closedReason !== undefined) return
    this.closedReason = reason
    const error = new ConnectionClosedError(reason)
    this.pending.forEach((w) => w.reject(error))
    this.pending.clear()
    this.closeListeners.forEach((l) => l(reason))
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
