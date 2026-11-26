// Presence records how long the person spends with a conversation on screen.
// The machine decides which stretches of time count, the recorder carries them
// to the interface, and this module joins them to what Electron reports and to
// the renderer's word about which conversation the window shows.
//
// Only two facts are watched, and both are free: whether a window of the app is
// in front, and how long since the last keyboard or mouse input anywhere on the
// machine. Time in another application is not counted, so the sum reads as time
// someone was at the computer looking at ollupi, never as wall-clock time.
//
// Presence keeps no connection of its own. A window already holds one, and only
// a window can show a conversation, so stretches go to the windows to write and
// the totals are read the same way: one socket for the app, and nothing here
// that another program's traffic can delay.

import { randomUUID } from 'node:crypto'
import type { PresenceInput } from '@ollupi/protocol'
import type { BackendState, PresenceAck, PresenceBatch, PresenceContext } from '../../shared/ipc'
import { PresenceRecorder, type PresenceTransport } from './recorder'
import { PresenceMachine, type PresenceSpan } from './state'
import { attention, type Attention } from './signals'

/** The open stretch is written again every minute, so a crash loses a minute
 * at most. */
const HEARTBEAT_MS = 60_000
/** How often the machine-wide idle clock is read. A stretch ends at the idle
 * limit rather than at this look, so the pace only bounds how late it closes,
 * and time that nobody counted as present never enters the sum. */
const LOOK_MS = 30_000
/** A quit waits this long for the stretches still queued; the rest is lost,
 * a minute of time at worst. */
const FLUSH_MS = 1_000
/** How long a batch waits for a window to answer. No window answering means
 * none is open, or the interface is mid-reload: keep the stretches and try
 * again later rather than hold the queue open forever. */
const ACK_MS = 5_000

/** What presence needs from the backend: its state, and word when it changes.
 * Writing is worth attempting only while a backend is up. */
export interface BackendStates {
  readonly state: BackendState
  on(event: 'state', listener: (state: BackendState) => void): void
  off(event: 'state', listener: (state: BackendState) => void): void
}

export interface PresenceOptions {
  /** One batch to every window; the first answer settles it. */
  send(batch: PresenceBatch): void
  /** A batch waits this long for an answer. */
  ackMs?: number
  /** The pause before an unanswered batch goes out again. */
  retryMs?: number
  /** The window and machine signals; the real ones come from Electron. */
  watch?: Attention
}

export class Presence {
  private readonly machine: PresenceMachine
  private readonly recorder: PresenceRecorder
  /** Batches handed out, waiting for the window that took them. */
  private readonly waiting = new Map<string, (outcome: PresenceAck['outcome']) => void>()
  private readonly timers: ReturnType<typeof setInterval>[] = []
  private readonly offs: (() => void)[] = []
  private readonly ackMs: number
  private started = false

  constructor(
    private readonly backend: BackendStates,
    private readonly opts: PresenceOptions,
  ) {
    this.ackMs = opts.ackMs ?? ACK_MS
    const transport: PresenceTransport = { deliver: (rows) => this.deliver(rows) }
    this.recorder = new PresenceRecorder({ transport, retryMs: opts.retryMs })
    this.machine = new PresenceMachine({
      now: () => Date.now(),
      id: () => randomUUID(),
      write: (span) => this.recorder.record([row(span)]),
    })
  }

  /** Starts watching the window and the backend. */
  start(): void {
    if (this.started) return
    this.started = true
    const watch = this.opts.watch ?? attention()
    this.offs.push(watch.onFocus((focused) => this.machine.focus(focused)))
    this.offs.push(watch.onAway((away) => this.machine.away(away)))
    this.backend.on('state', this.onBackend)
    // The backend may already be up before this starts.
    this.onBackend(this.backend.state)
    this.timers.push(
      setInterval(() => this.machine.input(watch.idleSeconds()), LOOK_MS),
      setInterval(() => this.machine.heartbeat(), HEARTBEAT_MS),
    )
    // Someone may have been at the computer all along.
    this.machine.input(watch.idleSeconds())
  }

  /** The conversation the window shows, or null when it shows none. */
  setContext(context: PresenceContext | null): void {
    this.machine.setContext(context)
  }

  /** A window's answer. Only the first one for a batch counts; the rest are
   * the other windows writing the same stretches, which the backend merges. */
  onAck(ack: PresenceAck): void {
    this.waiting.get(ack.batch)?.(ack.outcome)
  }

  /** Quitting: closes the open stretch and hands it to a window, briefly. */
  async stop(): Promise<void> {
    if (!this.started) return
    this.started = false
    this.timers.forEach((timer) => clearInterval(timer))
    this.timers.length = 0
    this.offs.forEach((off) => off())
    this.offs.length = 0
    this.backend.off('state', this.onBackend)
    this.machine.stop()
    // Nothing waiting: quitting does not pause for a round trip that has
    // nothing to carry.
    if (this.recorder.pending === 0) return
    await Promise.race([this.recorder.flush(), pause(FLUSH_MS)])
    this.recorder.close()
  }

  /** One batch out the door, and the promise of an answer. Resolves when it is
   * settled — written, or refused as impossible to store — and rejects only
   * when it should be tried again. */
  private deliver(rows: PresenceInput[]): Promise<void> {
    const id = randomUUID()
    return new Promise<void>((resolve, reject) => {
      const settle = (outcome: PresenceAck['outcome']): void => {
        clearTimeout(timer)
        this.waiting.delete(id)
        if (outcome === 'failed') reject(new Error('the stretches did not reach the backend'))
        else resolve()
      }
      const timer = setTimeout(() => settle('failed'), this.ackMs)
      timer.unref()
      this.waiting.set(id, settle)
      this.opts.send({ id, rows })
    })
  }

  private readonly onBackend = (state: BackendState): void => {
    this.recorder.setReady(state.status === 'ready')
  }
}

/** A stretch as the gateway takes it: times as ISO strings. */
function row(span: PresenceSpan): PresenceInput {
  return {
    id: span.id,
    threadId: span.threadId,
    workspaceId: span.workspaceId,
    state: span.state,
    start: new Date(span.start).toISOString(),
    end: new Date(span.end).toISOString(),
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref())
}
