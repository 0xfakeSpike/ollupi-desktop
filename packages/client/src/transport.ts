// A transport carries whole JSON-RPC messages as text. The peer never sees a
// socket, so tests drive it with an in-memory pair.

export interface TransportEvents {
  message(text: string): void
  close(reason: string): void
}

export interface Transport {
  send(text: string): void
  close(): void
  /** Called once; whatever arrives before is buffered for it. */
  listen(events: TransportEvents): void
}

/** The part of the WHATWG WebSocket the transport uses. */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void
}

export type WebSocketFactory = (url: string) => WebSocketLike

const OPEN = 1

/** Opens a WebSocket and resolves once it is open. */
export function connectWebSocket(
  url: string,
  create: WebSocketFactory = (u) => new WebSocket(u),
): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = create(url)
    let events: TransportEvents | undefined
    const early: string[] = []
    let closedWith: string | undefined
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
          for (const m of early.splice(0)) e.message(m)
          if (closedWith !== undefined) e.close(closedWith)
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
      else closedWith = reason
    })
    ws.addEventListener('error', () => {
      if (!opened) reject(new Error(`cannot connect to ${url.replace(/token=[^&]*/, 'token=***')}`))
    })
  })
}
