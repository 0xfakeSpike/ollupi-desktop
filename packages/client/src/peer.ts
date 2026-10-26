// A JSON-RPC 2.0 peer over a Transport. Both sides call, notify and answer:
// the gateway sends requests too (approvals, questions). Untyped on purpose;
// OllupiClient applies the protocol's method maps.

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
  constructor(readonly reason: string) {
    super(`connection closed: ${reason}`)
    this.name = 'ConnectionClosedError'
  }
}

export interface PeerHandlers {
  notification(method: string, params: unknown): void
  /** Resolves to the result, or rejects; an RpcError keeps its code. */
  request(method: string, params: unknown): Promise<unknown>
}

const INTERNAL_ERROR = -32603

export class RpcPeer {
  private nextId = 1
  private readonly waiting = new Map<Id, { resolve(v: unknown): void; reject(e: Error): void }>()
  private closedReason: string | undefined
  private readonly closeListeners = new Set<(reason: string) => void>()

  constructor(
    private readonly transport: Transport,
    private readonly handlers: PeerHandlers,
  ) {
    transport.listen({ message: (text) => this.receive(text), close: (reason) => this.closed(reason) })
  }

  get isClosed(): boolean {
    return this.closedReason !== undefined
  }

  call(method: string, params: unknown): Promise<unknown> {
    if (this.closedReason !== undefined) return Promise.reject(new ConnectionClosedError(this.closedReason))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
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
      this.handlers.notification(m.method, m.params)
    } else if (m.id !== undefined) {
      const waiter = this.waiting.get(m.id)
      if (!waiter) return
      this.waiting.delete(m.id)
      if (m.error) waiter.reject(new RpcError(m.error.code, m.error.message))
      else waiter.resolve(m.result)
    }
  }

  private async answer(id: Id, method: string, params: unknown): Promise<void> {
    try {
      const result = await this.handlers.request(method, params)
      this.send({ jsonrpc: '2.0', id, result })
    } catch (err) {
      const code = err instanceof RpcError ? err.code : INTERNAL_ERROR
      this.send({ jsonrpc: '2.0', id, error: { code, message: errorMessage(err) } })
    }
  }

  private closed(reason: string): void {
    if (this.closedReason !== undefined) return
    this.closedReason = reason
    const error = new ConnectionClosedError(reason)
    for (const w of this.waiting.values()) w.reject(error)
    this.waiting.clear()
    for (const l of this.closeListeners) l(reason)
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
