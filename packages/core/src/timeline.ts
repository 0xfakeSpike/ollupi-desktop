// A Timeline is the client's copy of one thread: its row, its turns, and the
// loaded tail of its items in the order of the conversation's log (seq,
// each item's first entry). It is a page read at one commit (seq) with the
// changes committed after it: a notification carries its commit's seq, and
// one up to the page's is already in it. Every function returns a new
// Timeline, so any state container can hold it and unchanged parts keep
// their identity.

import type { DeltaNotification, ItemRow, ServerNotifications, ThreadPageResult, ThreadRow, ThreadStatus, TurnRow } from '@ollupi/protocol'
import { waitsForAnswer, waitsForApproval } from './calls'

/** The notifications that change a thread's timeline. */
export type TimelineEventName = 'thread/changed' | 'turn/changed' | 'item/changed' | 'item/delta'

export type TimelineEvent = { [N in TimelineEventName]: { method: N; params: ServerNotifications[N] } }[TimelineEventName]

/** Applies one notification to the thread's timeline: a change committed
 * after the page was read, or text a model writes now, before the item
 * that holds it whole is kept. */
export function applyEvent(t: Timeline, e: TimelineEvent): Timeline {
  switch (e.method) {
    case 'thread/changed':
      return e.params.seq > t.seq && e.params.thread ? setThread(t, e.params.thread) : t
    case 'turn/changed':
      return e.params.seq > t.seq ? upsertTurn(t, e.params.turn) : t
    case 'item/changed':
      return e.params.seq > t.seq ? upsertItem(t, e.params.item) : t
    case 'item/delta':
      return appendDelta(t, e.params)
  }
}

export interface Timeline {
  thread: ThreadRow
  turns: TurnRow[]
  items: ItemRow[]
  /** The commit the page was read at. */
  seq: number
  /** Older items exist before items[0] (thread/read with beforeSeq). */
  hasMore: boolean
  /** Items streamed for a model reply that a newer user message overtook:
   * ollupi drops such a reply without logging it, and does not stop the
   * call, so what it still streams is ignored. */
  overtaken?: readonly string[]
}

export function timelineFromPage(page: ThreadPageResult): Timeline {
  return { thread: page.thread, turns: inQueue(page.turns), items: inOrder(page.items), seq: page.seq, hasMore: page.hasMore }
}

/** An empty timeline for a thread just started, before its first turn. */
export function emptyTimeline(thread: ThreadRow): Timeline {
  return { thread, turns: [], items: [], seq: 0, hasMore: false }
}

/** Merges the page read with beforeSeq = oldestSeq(t). What is loaded is
 * as new as the page or newer, so it wins. */
export function prependPage(t: Timeline, page: ThreadPageResult): Timeline {
  const known = new Set(t.items.map((i) => i.id))
  return {
    ...t,
    turns: merge(page.turns, t.turns),
    items: inOrder([...page.items.filter((i) => !known.has(i.id)), ...t.items]),
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
  const older = t.items.filter((i) => i.seq < first.seq && !streaming(i))
  // The page carries only the turns of its items and those not ended, so
  // the older items' turns stay as they were loaded.
  return older.length === 0 ? fresh : { ...fresh, turns: merge(t.turns, fresh.turns), items: [...older, ...fresh.items], hasMore: t.hasMore }
}

export function oldestSeq(t: Timeline): number | undefined {
  return t.items.find((i) => !streaming(i))?.seq
}

export function setThread(t: Timeline, thread: ThreadRow): Timeline {
  return { ...t, thread }
}

/** A turn that ends takes with it the text streamed for an item it never
 * kept, as when its model call failed. */
export function upsertTurn(t: Timeline, turn: TurnRow): Timeline {
  const next = { ...t, turns: merge(t.turns, [turn]) }
  return turnActive(turn.status) ? next : dropStreamed(next, turn.id)
}

/** A change to an item, kept unless what is loaded is newer (updated is its
 * latest entry). An error from the model ends the call whose text was
 * streaming. A user message that reaches a turn overtakes the call whose
 * text is streaming: that call's request was built before it, and ollupi
 * logs no reply that missed a newer message, so the text goes. */
export function upsertItem(t: Timeline, item: ItemRow): Timeline {
  const base = item.type === 'error' ? dropStreamed(t, item.turnId) : item.type === 'userMessage' && !t.items.some((r) => r.id === item.id) ? overtake(t, item.turnId) : t
  const items = base.items.slice()
  const i = items.findIndex((r) => r.id === item.id)
  if (i >= 0 && items[i]!.updated > item.updated) return base
  if (i >= 0) items[i] = item
  else items.push(item)
  return { ...base, items: inOrder(items) }
}

/** Text a model writes now, into the item it will be kept as: streamed
 * into one made for it until that item is kept, whole, by item/changed.
 * A delta says where in the item's final text it starts (offset, in UTF-16
 * code units, as a string's length counts), so one repeated or late takes
 * the place of what it repeats; one past the text held follows a delta that
 * was missed, and the text waits for item/changed instead. */
export function appendDelta(t: Timeline, d: Omit<DeltaNotification, 'threadId'>): Timeline {
  if (t.overtaken?.includes(d.itemId)) return t
  const i = t.items.findIndex((it) => it.id === d.itemId)
  const items = t.items.slice()
  if (i < 0) {
    if (d.offset > 0) return t
    items.push({ id: d.itemId, turnId: d.turnId, seq: Number.MAX_SAFE_INTEGER, updated: 0, type: d.type, status: 'inProgress', text: d.delta, startedAt: new Date().toISOString() })
    return { ...t, items }
  }
  const it = items[i]!
  const held = it.text ?? ''
  if (!streaming(it) || d.offset > held.length) return t
  items[i] = { ...it, text: held.slice(0, d.offset) + d.delta }
  return { ...t, items }
}

/** An item made for streamed text, not yet kept: no entry of the log is
 * its own. */
export function streaming(item: ItemRow): boolean {
  return item.updated === 0
}

/** Drops the turn's streamed items as dropStreamed does, and remembers them,
 * as their call may stream on. */
function overtake(t: Timeline, turnId: string): Timeline {
  const gone = t.items.filter((i) => i.turnId === turnId && streaming(i)).map((i) => i.id)
  return gone.length ? { ...dropStreamed(t, turnId), overtaken: [...(t.overtaken ?? []), ...gone] } : t
}

function dropStreamed(t: Timeline, turnId: string): Timeline {
  return t.items.some((i) => i.turnId === turnId && streaming(i)) ? { ...t, items: t.items.filter((i) => i.turnId !== turnId || !streaming(i)) } : t
}

/** Not ended: in progress, or queued behind the turn in progress. */
export function turnActive(status: TurnRow['status']): boolean {
  return status === 'inProgress' || status === 'queued'
}

/** The turn in progress. Those behind it wait for it (queuedTurns). */
export function activeTurn(t: Timeline): TurnRow | undefined {
  return t.turns.find((turn) => turn.status === 'inProgress')
}

/** What the turn in progress waits on the person for: an approval or an
 * answer, as the thread's status says (View.Status) or a call of its own
 * shows. An approval comes first: it blocks the call it is asked for. */
export function waitingFor(t: Timeline, status: ThreadStatus | undefined): 'approval' | 'answer' | undefined {
  const turn = activeTurn(t)
  if (!turn) return undefined
  const own = t.items.filter((it) => it.turnId === turn.id)
  if (status === 'waitingOnApproval' || own.some(waitsForApproval)) return 'approval'
  if (status === 'waitingOnUserInput' || own.some(waitsForAnswer)) return 'answer'
  return undefined
}

/** Turns waiting behind the one in progress, in the order they will run:
 * each message sent while the thread is busy is a turn of its own. */
export function queuedTurns(t: Timeline): TurnRow[] {
  return t.turns.filter((turn) => turn.status === 'queued')
}

/** What the turn in progress waits on once it has answered: the subagents
 * it launched and the calls it ran in the background that have not
 * reported yet, with nothing else of its own under way. Every subagent
 * reports back to the turn that launched it, so the turn waits on each.
 * Undefined while it is not waiting on any. */
export function awaitedReports(t: Timeline): { subagents: number; tasks: number } | undefined {
  const turn = activeTurn(t)
  if (!turn) return undefined
  const own = t.items.filter((it) => it.turnId === turn.id)
  const awaited = own.filter((it) => it.type === 'toolCall' && (it.childThreadId || it.taskId) && !own.some((r) => r.type === 'agentReport' && r.launchItemId === it.id))
  if (!awaited.length || own.some((it) => streaming(it) || it.status === 'pending' || it.status === 'inProgress')) return undefined
  const subagents = awaited.filter((it) => it.childThreadId).length
  return { subagents, tasks: awaited.length - subagents }
}

/** What a turn was sent: the message it started with and any sent into it
 * while it ran (turn/steer). */
export function turnMessages(t: Pick<Timeline, 'items'>, turnId: string): ItemRow[] {
  return t.items.filter((it) => it.turnId === turnId && it.type === 'userMessage')
}

/** When a turn came to be in progress: once it was queued and the turn
 * before it had ended, as only the turn in progress runs. Undefined when
 * the turn before is not loaded. */
export function turnStartedAt(t: Pick<Timeline, 'turns'>, turn: TurnRow): string | undefined {
  const i = t.turns.findIndex((x) => x.id === turn.id)
  if (i < 0) return undefined
  if (i === 0) return turn.queuedAt
  const before = t.turns[i - 1]!.completedAt
  if (!before) return undefined
  return Date.parse(before) > Date.parse(turn.queuedAt) ? before : turn.queuedAt
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

/** The log's order, an item streaming last. */
function inOrder(items: readonly ItemRow[]): ItemRow[] {
  return items.slice().sort((a, b) => a.seq - b.seq)
}

/** The order turns were queued in, which is the log's: a page lists them
 * so, and a turn heard of later was queued later. */
function inQueue(turns: readonly TurnRow[]): TurnRow[] {
  return turns.slice()
}

/** Updates rows by id; a row not there yet is newer than those that are. */
function merge<T extends { id: string }>(rows: readonly T[], updates: readonly T[]): T[] {
  const out = rows.slice()
  for (const u of updates) {
    const i = out.findIndex((r) => r.id === u.id)
    if (i >= 0) out[i] = u
    else out.push(u)
  }
  return out
}
