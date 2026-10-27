// Replays the recorded session's notifications (packages/protocol/
// fixtures/session.json, real traffic) through applyEvent, as the
// conversation domain does live, and checks the result against what the
// server itself returns for the thread at the end (thread/read). If the
// live updates ever diverged from the stored state, this fails.

import type { ThreadPageResult, ThreadRow } from '@ollupi/protocol'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { applyEvent, emptyTimeline, modelCalls, timelineFromPage, type TimelineEvent, type TimelineEventName } from './index'

interface Message {
  id?: number
  method?: string
  params?: any
  result?: any
}

const fixture = JSON.parse(readFileSync(new URL('../../protocol/fixtures/session.json', import.meta.url), 'utf8')) as {
  threadId: string
  messages: { direction: 'in' | 'out'; message: Message }[]
}

const timelineEvents: TimelineEventName[] = [
  'turn/queued',
  'turn/started',
  'turn/completed',
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'item/reasoning/textDelta',
]

/** The result of the client call that matches `pick`, by JSON-RPC id. */
function resultOf(pick: (m: Message) => boolean): any {
  const call = fixture.messages.findLast(({ direction, message }) => direction === 'out' && pick(message))
  return fixture.messages.find(({ direction, message }) => direction === 'in' && message.id === call?.message.id && !message.method)
    ?.message.result
}

it('live updates end where the server says the thread is', () => {
  const { thread } = resultOf((m) => m.method === 'thread/start') as { thread: ThreadRow }
  let t = emptyTimeline(thread)
  for (const { direction, message: m } of fixture.messages) {
    if (direction !== 'in' || !timelineEvents.includes(m.method as TimelineEventName)) continue
    if (m.params.threadId !== fixture.threadId) continue
    t = applyEvent(t, { method: m.method, params: m.params } as TimelineEvent)
  }
  const final = resultOf((m) => m.method === 'thread/read' && m.params.threadId === fixture.threadId) as ThreadPageResult

  expect(final.hasMore).toBe(false)
  expect([final.turns.length, final.items.length]).toEqual([t.turns.length, t.items.length])
  expect(final.items.length).toBeGreaterThan(20)
  expect(t.turns).toEqual(final.turns)
  expect(t.items).toEqual(final.items)
})

it("a turn's usage is the sum of its model calls' usage", () => {
  const final = resultOf((m) => m.method === 'thread/read' && m.params.threadId === fixture.threadId) as ThreadPageResult
  const calls = modelCalls(timelineFromPage(final))
  expect(calls.length).toBeGreaterThan(5)
  for (const turn of final.turns.filter((u) => u.status === 'completed')) {
    const mine = calls.filter((c) => c.turnId === turn.id)
    const sum = (k: 'inputTokens' | 'cachedInputTokens' | 'outputTokens') => mine.reduce((n, c) => n + (c.usage?.[k] ?? 0), 0)
    expect({ inputTokens: sum('inputTokens'), cachedInputTokens: sum('cachedInputTokens'), outputTokens: sum('outputTokens') }).toEqual(turn.usage)
  }
})
