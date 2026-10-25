// A transport moves whole JSON-RPC messages as text. The RPC layer never
// touches sockets, so tests can drive it with an in-memory pair.

export interface TransportEvents {
  message(text: string): void
  close(reason: string): void
}

export interface Transport {
  send(text: string): void
  close(): void
  /** Called once; events before it are buffered by the implementation. */
  listen(events: TransportEvents): void
}

/** The subset of the WHATWG WebSocket the transport needs. */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void
}

export type WebSocketFactory = (url: string) => WebSocketLike

const OPEN = 1

export function connectWebSocket(
  url: string,
  create: WebSocketFactory = (u) => new WebSocket(u),
): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = create(url)
    let events: TransportEvents | undefined
    const early: string[] = []
    let closed: string | undefined
    let opened = false

    ws.addEventListener('open', () => {
      opened = true
      resolve({
        send: (text) => {
          if (ws.readyState === OPEN) ws.send(text)
        },
        close: () => ws.close(1000, 'client closed'),
        listen: (e) => {
          events = e
          early.splice(0).forEach((m) => e.message(m))
          if (closed !== undefined) e.close(closed)
        },
      })
    })
    ws.addEventListener('message', (ev: { data: unknown }) => {
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data)
      if (events) events.message(text)
      else early.push(text)
    })
    ws.addEventListener('close', (ev: { code: number; reason: string }) => {
      const reason = ev.reason || `socket closed (${ev.code})`
      if (!opened) reject(new Error(reason))
      else if (events) events.close(reason)
      else closed = reason
    })
    ws.addEventListener('error', () => {
      if (!opened) reject(new Error(`cannot connect to ${redactToken(url)}`))
    })
  })
}

function redactToken(url: string): string {
  return url.replace(/token=[^&]*/, 'token=***')
}
