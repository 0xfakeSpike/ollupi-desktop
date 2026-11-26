import { describe, expect, it } from 'vitest'
import { IDLE_SECONDS, PresenceMachine, type PresenceSpan } from './state'

const T0 = 1_700_000_000_000

/** A machine on a clock the test moves, keeping every stretch it writes. */
function setup(): {
  machine: PresenceMachine
  spans: PresenceSpan[]
  advance(seconds: number): void
} {
  let now = T0
  let next = 0
  const spans: PresenceSpan[] = []
  const machine = new PresenceMachine({
    now: () => now,
    id: () => `s${++next}`,
    write: (span) => spans.push(span),
  })
  return {
    machine,
    spans,
    advance: (seconds) => {
      now += seconds * 1000
    },
  }
}

const conversation = (threadId: string): { threadId: string; workspaceId: string } => ({ threadId, workspaceId: 'w1' })

/** How long each stretch lasted, in ms. */
const lengths = (spans: PresenceSpan[]): number[] => spans.map((span) => span.end - span.start)

describe('PresenceMachine', () => {
  it('counts the time a conversation is on screen and closes it on quit', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(90)
    machine.stop()

    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ state: 'seen', threadId: 't1', workspaceId: 'w1' })
    expect(lengths(spans)).toEqual([90_000])
    expect(machine.isOpen).toBe(false)
  })

  it('splits when the window switches conversation', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(40)
    machine.setContext(conversation('t2'))
    advance(20)
    machine.stop()

    expect(spans.map((span) => [span.threadId, span.end - span.start])).toEqual([
      ['t1', 40_000],
      ['t2', 20_000],
    ])
  })

  it('keeps the app without a conversation apart from a conversation', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    advance(10)
    machine.setContext(conversation('t1'))
    advance(10)
    machine.setContext(null)
    advance(10)
    machine.stop()

    expect(spans.map((span) => [span.state, span.threadId, span.end - span.start])).toEqual([
      ['in_app', '', 10_000],
      ['seen', 't1', 10_000],
      ['in_app', '', 10_000],
    ])
  })

  it('ends a stretch at the idle limit rather than at the last keystroke', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(300)
    machine.input(200)
    machine.stop()

    expect(spans).toHaveLength(1)
    expect(lengths(spans)).toEqual([(300 - 200 + IDLE_SECONDS) * 1000])
  })

  it('starts a new stretch when the person comes back', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(60)
    machine.input(IDLE_SECONDS)
    advance(600)
    machine.input(0)
    advance(30)
    machine.stop()

    expect(spans.map((span) => span.end - span.start)).toEqual([60_000, 30_000])
  })

  it('counts time in another application as elsewhere, without a conversation', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(30)
    machine.focus(false)
    advance(20)
    machine.stop()

    expect(spans.map((span) => [span.state, span.threadId, span.end - span.start])).toEqual([
      ['seen', 't1', 30_000],
      ['elsewhere', '', 20_000],
    ])
  })

  it('records nothing while the screen is locked', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(30)
    machine.away(true)
    advance(3_600)
    machine.away(false)
    advance(30)
    machine.stop()

    expect(spans.map((span) => span.end - span.start)).toEqual([30_000, 30_000])
  })

  it('writes the open stretch again on a heartbeat, under the same id', () => {
    const { machine, spans, advance } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    advance(30)
    machine.heartbeat()
    advance(30)
    machine.heartbeat()

    expect(machine.isOpen).toBe(true)
    expect(spans.map((span) => span.end - span.start)).toEqual([30_000, 60_000])
    expect(new Set(spans.map((span) => span.id)).size).toBe(1)
  })

  it('writes nothing for a stretch that begins and ends at once', () => {
    const { machine, spans } = setup()

    machine.focus(true)
    machine.setContext(conversation('t1'))
    machine.setContext(conversation('t2'))

    expect(spans).toHaveLength(0)
    expect(machine.isOpen).toBe(true)
  })
})
