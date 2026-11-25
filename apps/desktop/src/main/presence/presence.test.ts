import type { BackendState, PresenceAck, PresenceBatch, PresenceContext } from '../../shared/ipc'
import { describe, expect, it, vi } from 'vitest'
import { Presence, type BackendStates } from './presence'
import type { Attention } from './signals'

vi.mock('electron', () => ({}))

const ready: BackendState = { status: 'ready', url: 'ws://localhost:1/', token: 't', profile: 'default', version: '0' }
const thread: PresenceContext = { threadId: 't1', workspaceId: 'w1' }

/** A backend that says when it is up, without a process behind it. */
class FakeBackend implements BackendStates {
  state: BackendState = { status: 'starting' }
  private listeners: ((state: BackendState) => void)[] = []

  on(_event: 'state', listener: (state: BackendState) => void): void {
    this.listeners.push(listener)
  }

  off(_event: 'state', listener: (state: BackendState) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  set(state: BackendState): void {
    this.state = state
    this.listeners.forEach((l) => l(state))
  }
}

/** The window and the machine, with the signals kept so a test can move them. */
class FakeAttention implements Attention {
  focus: ((focused: boolean) => void) | undefined
  away: ((away: boolean) => void) | undefined
  idle = 0

  onFocus(listener: (focused: boolean) => void): () => void {
    this.focus = listener
    return () => {
      this.focus = undefined
    }
  }

  onAway(listener: (away: boolean) => void): () => void {
    this.away = listener
    return () => {
      this.away = undefined
    }
  }

  idleSeconds(): number {
    return this.idle
  }
}

async function until(condition: () => boolean, ms = 1_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Every stretch that reached a window, in the order it arrived. A stretch
 * that opened and closed within a millisecond is not written at all, so tests
 * look for their row rather than count batches. */
const rows = (sent: PresenceBatch[]) => sent.flatMap((batch) => batch.rows)

/** A presence watching a window and a backend, with the batches it hands out
 * kept. `autoAck` answers every batch, as a window with a live connection
 * would. */
function harness(want: { autoAck?: boolean } = {}): {
  backend: FakeBackend
  watch: FakeAttention
  sent: PresenceBatch[]
  presence: Presence
  ack(outcome: PresenceAck['outcome']): void
} {
  const backend = new FakeBackend()
  const watch = new FakeAttention()
  const sent: PresenceBatch[] = []
  let answer: (ack: PresenceAck) => void = () => {}
  const presence = new Presence(backend, {
    send: (batch) => {
      sent.push(batch)
      if (want.autoAck) void Promise.resolve().then(() => answer({ batch: batch.id, outcome: 'wrote' }))
    },
    ackMs: 20,
    retryMs: 10,
    watch,
  })
  answer = (ack) => presence.onAck(ack)
  presence.start()
  backend.set(ready)
  return { backend, watch, sent, presence, ack: (outcome) => answer({ batch: sent.at(-1)?.id ?? '', outcome }) }
}

describe('Presence', () => {
  it('hands the conversation on screen to a window to write', async () => {
    const h = harness({ autoAck: true })
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(10)
    h.watch.focus?.(false)
    await until(() => rows(h.sent).some((row) => row.state === 'seen'))

    const row = rows(h.sent).find((r) => r.state === 'seen')!
    expect(row.threadId).toBe('t1')
    expect(row.workspaceId).toBe('w1')
    expect(Date.parse(row.end)).toBeGreaterThanOrEqual(Date.parse(row.start))
    await h.presence.stop()
  })

  it('closes a stretch when the window loses the front and names it elsewhere', async () => {
    const h = harness({ autoAck: true })
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(5)
    h.watch.focus?.(false)
    await until(() => rows(h.sent).some((row) => row.state === 'seen'))

    await pause(5)
    h.watch.focus?.(true)
    await until(() => rows(h.sent).some((row) => row.state === 'elsewhere'))
    expect(rows(h.sent).find((row) => row.state === 'elsewhere')!.threadId).toBe('')

    await pause(5)
    await h.presence.stop()
    await until(() => rows(h.sent).filter((row) => row.state === 'seen').length === 2)
  })

  it('waits while there is no backend, then writes what it counted', async () => {
    const h = harness({ autoAck: true })
    h.backend.set({ status: 'starting' })
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(5)
    h.watch.focus?.(false)
    await pause(10)

    expect(h.sent).toEqual([])

    h.backend.set(ready)
    await until(() => rows(h.sent).some((row) => row.state === 'seen'))
    await h.presence.stop()
  })

  it('sends a batch again while no window answers it', async () => {
    const h = harness()
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(5)
    h.watch.focus?.(false)
    await until(() => h.sent.length === 1)

    await until(() => h.sent.length === 2)
    expect(h.sent[1]!.rows[0]!.id).toBe(h.sent[0]!.rows[0]!.id)

    h.ack('wrote')
    await h.presence.stop()
  })

  it('sends a batch again when the window could not reach the backend', async () => {
    const h = harness()
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(5)
    h.watch.focus?.(false)
    await until(() => h.sent.length === 1)

    h.ack('failed')
    await until(() => h.sent.length === 2)
    expect(h.sent[1]!.rows[0]!.id).toBe(h.sent[0]!.rows[0]!.id)

    h.ack('wrote')
    await h.presence.stop()
  })

  it('drops a batch the backend refuses instead of retrying it', async () => {
    const h = harness()
    h.watch.focus?.(true)
    h.presence.setContext(thread)
    await pause(5)
    h.watch.focus?.(false)
    await until(() => h.sent.length === 1)

    h.ack('refused')
    // Longer than the retry pause: a refused batch must not come back.
    await pause(60)
    expect(h.sent.length).toBe(1)
    await h.presence.stop()
  })

  it('closes the open stretch on a quit and hands it over', async () => {
    const h = harness({ autoAck: true })
    h.presence.setContext(thread)
    h.watch.focus?.(true)
    await pause(5)

    await h.presence.stop()

    const written = h.sent.flatMap((batch) => batch.rows)
    const seen = written.filter((row) => row.state === 'seen')
    expect(seen.length).toBe(1)
    expect(seen[0]!.threadId).toBe('t1')
    expect(Date.parse(seen[0]!.end)).toBeGreaterThanOrEqual(Date.parse(seen[0]!.start))
  })
})
