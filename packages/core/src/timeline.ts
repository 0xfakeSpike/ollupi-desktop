// A Timeline is the client's copy of one thread: its row, its turns, and the
// loaded tail of its items, sorted by seq. Every function returns a new
// Timeline, so any state container can hold it and unchanged parts keep
// their identity.

import type { ItemRow, ThreadPageResult, ThreadRow, TurnRow } from '@ollupi/protocol'
import { waitsForAnswer, waitsForApproval } from './calls'

export interface Timeline {
  thread: ThreadRow
  turns: TurnRow[]
  items: ItemRow[]
  /** Older items exist before items[0] (thread/read with beforeSeq). */
  hasMore: boolean
}

export function timelineFromPage(page: ThreadPageResult): Timeline {
  return { thread: page.thread, turns: bySeq(page.turns), items: bySeq(page.items), hasMore: page.hasMore }
}

/** An empty timeline for a thread just started, before its first turn. */
export function emptyTimeline(thread: ThreadRow): Timeline {
  return { thread, turns: [], items: [], hasMore: false }
}

/** Merges the page read with beforeSeq = oldestSeq(t). */
export function prependPage(t: Timeline, page: ThreadPageResult): Timeline {
  const known = new Set(t.items.map((i) => i.id))
  return {
    thread: page.thread,
    turns: merge(t.turns, page.turns),
    items: bySeq([...page.items.filter((i) => !known.has(i.id)), ...t.items]),
    hasMore: page.hasMore,
  }
}

/** Replaces the live tail with a fresh latest page (after a reconnect),
 * keeping already loaded items older than it: those belong to finished
 * turns, which no longer change. */
export function refreshFromPage(t: Timeline, page: ThreadPageResult): Timeline {
  const fresh = timelineFromPage(page)
  const first = fresh.items[0]?.seq ?? Number.POSITIVE_INFINITY
  const older = t.items.filter((i) => i.seq < first)
  return older.length === 0 ? fresh : { ...fresh, items: [...older, ...fresh.items], hasMore: t.hasMore }
}

export function oldestSeq(t: Timeline): number | undefined {
  return t.items[0]?.seq
}

export function setThread(t: Timeline, thread: ThreadRow): Timeline {
  return { ...t, thread }
}

export function upsertTurn(t: Timeline, turn: TurnRow): Timeline {
  return { ...t, turns: merge(t.turns, [turn]) }
}

export function upsertItem(t: Timeline, item: ItemRow): Timeline {
  return { ...t, items: merge(t.items, [item]) }
}

/** Streams text into an item. The gateway sends item/started before any
 * delta and the full text with item/completed, so a delta for an item not
 * loaded has nothing to extend and is dropped. */
export function appendDelta(t: Timeline, itemId: string, delta: string): Timeline {
  const i = t.items.findIndex((it) => it.id === itemId)
  if (i < 0) return t
  const items = t.items.slice()
  const it = items[i]!
  items[i] = { ...it, text: (it.text ?? '') + delta }
  return { ...t, items }
}

/** The turn running now; a thread runs at most one at a time. */
export function activeTurn(t: Timeline): TurnRow | undefined {
  return t.turns.find((turn) => turn.status === 'inProgress')
}

/** repo.ThreadState.PendingRequests for this thread alone: a call of the
 * running turn waits for an approval or an answer. (The thread's status
 * also counts its subagents' waits; this does not.) */
export function waitingOnUser(t: Timeline): boolean {
  const turn = activeTurn(t)
  return !!turn && t.items.some((it) => it.turnId === turn.id && (waitsForApproval(it) || waitsForAnswer(it)))
}

/** Turns waiting to start, in the order they will run. Their input lives on
 * the turn row until they start and it becomes a user message item. */
export function queuedTurns(t: Timeline): TurnRow[] {
  return t.turns.filter((turn) => turn.status === 'queued')
}

/** The model a new turn continues with when none is chosen: the server uses
 * the last turn's connection, else the default. */
export function lastConnection(t: Timeline): string | undefined {
  return t.turns.at(-1)?.model.connection
}

export interface TurnGroup {
  turn: TurnRow
  items: ItemRow[]
}

/** Loaded items under their turn, in order. Items always belong to a turn
 * the page carries (thread/read returns every turn), and queued turns have
 * no items yet, so they produce no group. */
export function groupByTurn(t: Timeline): TurnGroup[] {
  const byTurn = new Map<string, ItemRow[]>()
  for (const it of t.items) {
    const list = byTurn.get(it.turnId)
    if (list) list.push(it)
    else byTurn.set(it.turnId, [it])
  }
  return t.turns.flatMap((turn) => {
    const items = byTurn.get(turn.id)
    return items ? [{ turn, items }] : []
  })
}

function bySeq<T extends { seq: number }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.seq - b.seq)
}

function merge<T extends { id: string; seq: number }>(rows: readonly T[], updates: readonly T[]): T[] {
  const out = rows.slice()
  for (const u of updates) {
    const i = out.findIndex((r) => r.id === u.id)
    if (i >= 0) out[i] = u
    else out.push(u)
  }
  return bySeq(out)
}
