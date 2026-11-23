// The recorder carries the stretches the machine decides on to the interface,
// which writes them with the gateway connection a window already holds. A
// batch waits for an answer: nothing it was told to write is dropped from the
// queue before the window says it reached the backend, and a batch that failed
// or went unanswered stays at the front, in order, and is tried again after a
// pause. While no backend is ready the queue simply waits, and the queue is
// memory only: at most QUEUE_LIMIT stretches, so a long outage costs stretches
// rather than anything the person is doing.

import type { PresenceInput } from '@ollupi/protocol'

/** Carrying one batch away: resolves when the backend took the rows or will never
 * take them as they are, and throws only when the batch should be tried again. */
export interface PresenceTransport {
  deliver(rows: PresenceInput[]): Promise<void>
}

export interface RecorderOptions {
  transport: PresenceTransport
  /** Rows per batch, and the pause before a batch is tried again. */
  batch?: number
  limit?: number
  retryMs?: number
}

const BATCH = 50
const QUEUE_LIMIT = 500
const RETRY_MS = 5_000

export class PresenceRecorder {
  private readonly batch: number
  private readonly limit: number
  private readonly retryMs: number
  private queue: PresenceInput[] = []
  private ready = false
  private running = false
  private dirty = false
  private waiters: (() => void)[] = []
  private retry: ReturnType<typeof setTimeout> | undefined
  private stopped = false

  constructor(private readonly opts: RecorderOptions) {
    this.batch = opts.batch ?? BATCH
    this.limit = opts.limit ?? QUEUE_LIMIT
    this.retryMs = opts.retryMs ?? RETRY_MS
  }

  /** Whether there is a backend worth writing to; follows its state. Batches
   * waiting for an answer are not interrupted, only the next one is. */
  setReady(ready: boolean): void {
    this.ready = ready
    if (ready) this.drain()
  }

  /** Stretches just closed, or the open one again with a later end. */
  record(rows: PresenceInput[]): void {
    if (!rows.length) return
    this.queue.push(...rows)
    if (this.queue.length > this.limit) this.queue.splice(0, this.queue.length - this.limit)
    this.drain()
  }

  /** Sends what waits, for a quit; resolves when a pass ends, which is when
   * the queue is empty, the backend went, or a send failed. */
  async flush(): Promise<void> {
    this.clearRetry()
    this.drain()
    if (!this.running) return
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  /** How many stretches wait, for tests and for a quit that need not wait. */
  get pending(): number {
    return this.queue.length
  }

  close(): void {
    this.stopped = true
    this.clearRetry()
  }

  /** One pass at a time: a batch that arrives while a pass is in flight is
   * taken by that pass, and a `dirty` mark starts another one if it ended
   * between the check and the last row. Two passes would hand the same stretch
   * out twice, which the backend would only merge. */
  private drain(): void {
    if (this.running) {
      this.dirty = true
      return
    }
    this.running = true
    void this.run().finally(() => {
      this.running = false
      if (this.dirty) {
        this.dirty = false
        this.drain()
        return
      }
      const waiting = this.waiters
      this.waiters = []
      waiting.forEach((settle) => settle())
    })
  }

  private async run(): Promise<void> {
    while (this.ready && this.queue.length && !this.stopped) {
      const batch = this.queue.slice(0, this.batch)
      try {
        await this.opts.transport.deliver(batch)
      } catch {
        // Keep them, in order, for the next attempt.
        this.schedule()
        return
      }
      // The batch is settled: written, or refused as impossible to store. A
      // refused batch leaves the queue too, or it would hold every stretch
      // behind it back for good.
      this.queue.splice(0, batch.length)
    }
  }

  private schedule(): void {
    if (this.retry || this.stopped) return
    this.retry = setTimeout(() => {
      this.retry = undefined
      this.drain()
    }, this.retryMs)
  }

  private clearRetry(): void {
    if (!this.retry) return
    clearTimeout(this.retry)
    this.retry = undefined
  }
}
