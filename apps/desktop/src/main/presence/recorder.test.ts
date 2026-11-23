import type { PresenceInput } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import { PresenceRecorder, type PresenceTransport } from './recorder'

const row = (id: string): PresenceInput => ({
  id,
  state: 'seen',
  threadId: 't1',
  start: '2026-01-01T09:00:00.000Z',
  end: '2026-01-01T09:01:00.000Z',
})

/** A transport that keeps what it was given, can be made to fail, and can be
 * made to hang without answering. */
class FakeTransport implements PresenceTransport {
  readonly sent: PresenceInput[] = []
  readonly batches: number[] = []
  /** Batches given out and not yet settled. */
  readonly open: (() => void)[] = []
  failures = 0
  hanging = false

  async deliver(rows: PresenceInput[]): Promise<void> {
    if (this.failures > 0) {
      this.failures--
      throw new Error('no window answered')
    }
    if (this.hanging) {
      return new Promise<void>((resolve) => {
        this.open.push(() => {
          this.batches.push(rows.length)
          this.sent.push(...rows)
          resolve()
        })
      })
    }
    this.batches.push(rows.length)
    this.sent.push(...rows)
  }

  /** Answers the oldest batch that is still open. */
  settle(): void {
    this.open.shift()?.()
  }

  get asked(): number {
    return this.batches.reduce((a, b) => a + b, 0)
  }
}

async function until(condition: () => boolean, ms = 1_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('PresenceRecorder', () => {
  it('sends queued stretches in batches once a backend is ready', async () => {
    const transport = new FakeTransport()
    const recorder = new PresenceRecorder({ transport, batch: 2 })

    recorder.record([row('a'), row('b'), row('c')])
    expect(recorder.pending).toBe(3)
    recorder.setReady(true)
    await recorder.flush()

    expect(transport.batches).toEqual([2, 1])
    expect(transport.sent.map((input) => input.id)).toEqual(['a', 'b', 'c'])
    expect(recorder.pending).toBe(0)
  })

  it('waits without sending while there is no backend', async () => {
    const transport = new FakeTransport()
    const recorder = new PresenceRecorder({ transport })

    recorder.record([row('a')])
    await recorder.flush()

    expect(transport.sent).toEqual([])
    expect(recorder.pending).toBe(1)

    recorder.setReady(true)
    await until(() => transport.sent.length === 1)
    expect(recorder.pending).toBe(0)
  })

  it('keeps a failed batch at the front and tries it again in order', async () => {
    const transport = new FakeTransport()
    const recorder = new PresenceRecorder({ transport, batch: 1, retryMs: 10 })

    recorder.setReady(true)
    transport.failures = 1
    recorder.record([row('a')])
    await until(() => transport.failures === 0)
    expect(transport.sent).toEqual([])
    expect(recorder.pending).toBe(1)

    recorder.record([row('b')])
    await until(() => transport.sent.length === 2)
    expect(transport.sent.map((input) => input.id)).toEqual(['a', 'b'])
  })

  it('holds a batch until the window answers it', async () => {
    const transport = new FakeTransport()
    transport.hanging = true
    const recorder = new PresenceRecorder({ transport, batch: 2 })

    recorder.setReady(true)
    recorder.record([row('a'), row('b'), row('c')])
    await until(() => transport.open.length === 1)
    expect(recorder.pending).toBe(3)

    transport.hanging = false
    transport.settle()
    await until(() => transport.sent.length === 3)
    expect(transport.sent.map((input) => input.id)).toEqual(['a', 'b', 'c'])
    expect(recorder.pending).toBe(0)
  })

  it('keeps at most the newest stretches in the queue', async () => {
    const transport = new FakeTransport()
    const recorder = new PresenceRecorder({ transport, limit: 2 })

    recorder.record([row('a'), row('b'), row('c')])
    recorder.setReady(true)
    await recorder.flush()

    expect(transport.sent.map((input) => input.id)).toEqual(['b', 'c'])
  })

  it('gives up on a quit that cannot send', async () => {
    const transport = new FakeTransport()
    const recorder = new PresenceRecorder({ transport, retryMs: 10 })

    recorder.record([row('a')])
    const started = Date.now()
    await recorder.flush()

    expect(Date.now() - started).toBeLessThan(50)
    expect(recorder.pending).toBe(1)

    recorder.close()
    recorder.setReady(true)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(transport.sent).toEqual([])
  })
})
