// A Timeline is the client's copy of one thread: its row, its turns, and the
// loaded tail of its items in the conversation's order: by their turn's seq,
// then their own (ollupi writes a message sent while a turn runs into the
// turn behind it, so its seq can be lower than items of the turn ahead). Every function returns a new
// Timeline, so any state container can hold it and unchanged parts keep
// their identity.

import type { ItemRow, ServerNotifications, ThreadPageResult, ThreadRow, ThreadStatus, TurnRow } from '@ollupi/protocol'
import { waitsForAnswer, waitsForApproval } from './calls'

/** The notifications that change a thread's timeline. */
export type TimelineEventName =
  | 'turn/queued'
  | 'turn/started'
  | 'turn/completed'
  | 'item/started'
  | 'item/updated'
  | 'item/completed'
  | 'item/agentMessage/delta'
  | 'item/reasoning/textDelta'

export type TimelineEvent = { [N in TimelineEventName]: { method: N; params: ServerNotifications[N] } }[TimelineEventName]

/** Applies one notification to the thread's timeline: turn notifications
 * carry the turn and the thread as stored after it, item notifications the
 * item as stored (item/updated when an unfinished one changes, such as a
 * call's execution frozen before it is approved), deltas the text streamed
 * since. */
export function applyEvent(t: Timeline, e: TimelineEvent): Timeline {
  switch (e.method) {
    case 'turn/queued':
    case 'turn/started':
    case 'turn/completed':
      return upsertTurn(setThread(t, e.params.thread), e.params.turn)
    case 'item/started':
    case 'item/updated':
    case 'item/completed':
      return upsertItem(t, e.params.item)
    case 'item/agentMessage/delta':
    case 'item/reasoning/textDelta':
      return appendDelta(t, e.params.itemId, e.params.delta)
  }
}

export interface Timeline {
  thread: ThreadRow
  turns: TurnRow[]
  items: ItemRow[]
  /** Older items exist before items[0] (thread/read with beforeSeq). */
  hasMore: boolean
}

export function timelineFromPage(page: ThreadPageResult): Timeline {
  const turns = bySeq(page.turns)
  return { thread: page.thread, turns, items: inOrder(page.items, turns), hasMore: page.hasMore }
}

/** An empty timeline for a thread just started, before its first turn. */
export function emptyTimeline(thread: ThreadRow): Timeline {
  return { thread, turns: [], items: [], hasMore: false }
}

/** Merges the page read with beforeSeq = oldestSeq(t). */
export function prependPage(t: Timeline, page: ThreadPageResult): Timeline {
  const known = new Set(t.items.map((i) => i.id))
  const turns = merge(t.turns, page.turns)
  return {
    thread: page.thread,
    turns,
    items: inOrder([...page.items.filter((i) => !known.has(i.id)), ...t.items], turns),
    hasMore: page.hasMore,
  }
}

/** Replaces the live tail with a fresh latest page (after a reconnect),
 * keeping already loaded items older than it: those belong to finished
 * turns, which no longer change. */
export function refreshFromPage(t: Timeline, page: ThreadPageResult): Timeline {
  const fresh = timelineFromPage(page)
  const first = fresh.items[0]
  if (!first) return fresh
  // The page carries only the turns of its items and those not ended, so
  // the older items' turns come from what was loaded.
  const turns = merge(t.turns, fresh.turns)
  const before = itemOrder(turns)
  const older = t.items.filter((i) => before(i, first) < 0)
  return older.length === 0 ? fresh : { ...fresh, turns, items: [...older, ...fresh.items], hasMore: t.hasMore }
}

export function oldestSeq(t: Timeline): number | undefined {
  return t.items[0]?.seq
}

export function setThread(t: Timeline, thread: ThreadRow): Timeline {
  return { ...t, thread }
}

export function upsertTurn(t: Timeline, turn: TurnRow): Timeline {
  const known = t.turns.some((x) => x.id === turn.id)
  const turns = merge(t.turns, [turn])
  // A turn told of after its items places them.
  return { ...t, turns, items: known ? t.items : inOrder(t.items, turns) }
}

export function upsertItem(t: Timeline, item: ItemRow): Timeline {
  const items = t.items.slice()
  const i = items.findIndex((r) => r.id === item.id)
  if (i >= 0) items[i] = item
  else items.push(item)
  return { ...t, items: i >= 0 ? items : inOrder(items, t.turns) }
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

/** Not ended (repo.TurnStatus.Ended): in a slot it is inProgress; out of
 * one it is ready for a slot, or waiting on the person or on the subagents
 * it launched. */
export function turnActive(status: TurnRow['status']): boolean {
  return status !== 'completed' && status !== 'interrupted' && status !== 'failed'
}

/** The turn under way: the thread's first one not ended. Those behind it
 * wait for it (queuedTurns). */
export function activeTurn(t: Timeline): TurnRow | undefined {
  return t.turns.find((turn) => turnActive(turn.status))
}

/** What the running turn waits on the person for: an approval or an
 * answer. A call of its own says so (repo.ThreadState.PendingRequests); a
 * subagent's wait shows only in the thread's status, which counts it as the
 * thread's own. An approval comes first: it blocks the call it is asked for. */
export function waitingFor(t: Timeline, status: ThreadStatus | undefined): 'approval' | 'answer' | undefined {
  const turn = activeTurn(t)
  if (!turn) return undefined
  const own = t.items.filter((it) => it.turnId === turn.id)
  if (status === 'waitingOnApproval' || own.some(waitsForApproval)) return 'approval'
  if (status === 'waitingOnUserInput' || own.some(waitsForAnswer)) return 'answer'
  return undefined
}

/** Turns waiting behind the one under way, in the order they will run.
 * ollupi writes each ready, with the messages it answers (userMessage
 * items): a message sent while the thread is busy joins the one waiting. */
export function queuedTurns(t: Timeline): TurnRow[] {
  return t.turns.filter((turn) => turnActive(turn.status)).slice(1)
}

/** What a turn was sent: its messages, those it started with and any sent
 * into it or joined while it waited. */
export function turnMessages(t: Pick<Timeline, 'items'>, turnId: string): ItemRow[] {
  return t.items.filter((it) => it.turnId === turnId && it.type === 'userMessage')
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
 * the page carries (thread/read returns the turns of its items and those
 * not ended). */
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

/** Compares items in the conversation's order: their turn's seq, then
 * theirs. An item whose turn is not known yet goes last. */
function itemOrder(turns: readonly TurnRow[]): (a: ItemRow, b: ItemRow) => number {
  const seqOf = new Map(turns.map((turn) => [turn.id, turn.seq]))
  const turnSeq = (it: ItemRow) => seqOf.get(it.turnId) ?? Number.POSITIVE_INFINITY
  return (a, b) => turnSeq(a) - turnSeq(b) || a.seq - b.seq
}

function inOrder(items: readonly ItemRow[], turns: readonly TurnRow[]): ItemRow[] {
  return items.slice().sort(itemOrder(turns))
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
