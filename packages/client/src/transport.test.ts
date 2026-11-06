import { describe, expect, it } from 'vitest'
import { connectWebSocket, type WebSocketLike } from './transport'

describe('connectWebSocket', () => {
  it('offers the token as a subprotocol and keeps it out of the URL', async () => {
    const asked: { url: string; protocols: string[] }[] = []
    const create = (url: string, protocols: string[]) => {
      asked.push({ url, protocols })
      return {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          if (type === 'open') queueMicrotask(() => listener({}))
        },
      } as unknown as WebSocketLike
    }
    await connectWebSocket('ws://127.0.0.1:1234/', 'secret', create)
    expect(asked).toEqual([{ url: 'ws://127.0.0.1:1234/', protocols: ['ollupi.token', 'secret'] }])
  })
})
