// The presence machine decides when a stretch of time begins and ends, from
// what the main process can observe: which window is in front, whether the
// machine is locked or asleep, how long since the last input, and which
// conversation the window shows. It holds no Electron or timer of its own, so
// its rules can be tested with a clock handed in.
//
// A stretch is open while the person is present, and its state says what the
// window showed: the conversation on screen, the app without one, or another
// application altogether. Time without a stretch is time the machine saw no
// person: no input for the idle limit, or the screen locked or the machine
// asleep. Those gaps stay unrecorded on purpose, so the sum always reads as
// time someone was at the computer, never as wall-clock time.

import type { PresenceContext } from '../../shared/ipc'

export type PresenceState = 'seen' | 'in_app' | 'elsewhere'

/** One stretch of time in milliseconds since the epoch, as the gateway takes it. */
export interface PresenceSpan {
  id: string
  state: PresenceState
  threadId: string
  workspaceId: string
  start: number
  end: number
}

/** Seconds without keyboard or mouse input after which nobody is taken to be
 * at the computer. Three minutes is longer than any pause spent reading a
 * thread or a diff and shorter than a coffee break, and a stretch ending at
 * the limit instead of at the last keystroke errs by at most that much. */
export const IDLE_SECONDS = 180

export interface MachineOptions {
  now(): number
  /** A fresh id per stretch; the gateway extends a row it is sent twice. */
  id(): string
  /** Every stretch when it closes, and the open one on each heartbeat, so a
   * crash loses at most the time since the last beat. */
  write(span: PresenceSpan): void
  idleSeconds?: number
}

interface Wanted {
  state: PresenceState
  threadId: string
  workspaceId: string
}

export class PresenceMachine {
  private readonly idleLimit: number
  private open: (Wanted & { id: string; start: number }) | undefined
  private context: PresenceContext | undefined
  private focused = false
  private awayNow = false
  private idle = 0

  constructor(private readonly opts: MachineOptions) {
    this.idleLimit = opts.idleSeconds ?? IDLE_SECONDS
  }

  /** Which conversation the window shows; null when it shows none. */
  setContext(context: PresenceContext | null): void {
    this.context = context?.threadId ? context : undefined
    this.evaluate()
  }

  /** A window of the app gained or lost the front. */
  focus(focused: boolean): void {
    this.focused = focused
    this.evaluate()
  }

  /** The screen locked or the machine went to sleep, or the person is back. */
  away(away: boolean): void {
    this.awayNow = away
    this.evaluate()
  }

  /** Seconds since the last keyboard or mouse input, as the system counts them. */
  input(idleSeconds: number): void {
    this.idle = idleSeconds
    if (idleSeconds >= this.idleLimit && this.open) {
      // The person stopped typing `idleSeconds` ago, so the stretch ended one
      // limit after the last input, not now, which may be long after.
      this.finish(this.opts.now() - idleSeconds * 1000 + this.idleLimit * 1000)
    }
    this.evaluate()
  }

  /** Writes the open stretch again with a later end, so a crash loses a minute. */
  heartbeat(): void {
    const open = this.open
    if (!open) return
    const now = this.opts.now()
    if (now <= open.start) return
    this.opts.write({ ...open, end: now })
  }

  /** Closes the open stretch: the app is quitting, or the person left for good. */
  stop(): void {
    this.finish(this.opts.now())
    this.focused = false
    this.awayNow = true
  }

  /** Whether a stretch is open, for tests and diagnostics. */
  get isOpen(): boolean {
    return this.open !== undefined
  }

  private wanted(): Wanted | undefined {
    if (this.awayNow || this.idle >= this.idleLimit) return undefined
    if (!this.focused) return { state: 'elsewhere', threadId: '', workspaceId: '' }
    if (!this.context) return { state: 'in_app', threadId: '', workspaceId: '' }
    // The interface names the conversation and its project; the todos it
    // works on are the backend's to find from the conversation.
    const { threadId, workspaceId } = this.context
    return { state: 'seen', threadId, workspaceId }
  }

  private evaluate(): void {
    const now = this.opts.now()
    const wanted = this.wanted()
    if (this.open && !same(this.open, wanted)) this.finish(now)
    if (!this.open && wanted) this.open = { ...wanted, id: this.opts.id(), start: now }
  }

  private finish(at: number): void {
    const open = this.open
    this.open = undefined
    if (!open || at <= open.start) return
    const { id, state, threadId, workspaceId, start } = open
    this.opts.write({ id, state, threadId, workspaceId, start, end: at })
  }
}

/** Whether the open stretch already says what the moment wants. */
function same(open: Wanted, wanted: Wanted | undefined): boolean {
  if (!wanted) return false
  return open.state === wanted.state && open.threadId === wanted.threadId && open.workspaceId === wanted.workspaceId
}
