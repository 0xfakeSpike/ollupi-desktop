// A Timeline is the client's copy of one thread: its turns and the (possibly
// partial) tail of its items, kept sorted by seq. Every function is a pure
// update returning a new Timeline, so any state container can hold it and
// unchanged parts keep their identity for cheap re-renders.

import type { ItemRow, ThreadPage, ThreadRow, TurnRow } from '@ollupi/protocol'

export interface Timeline {
  thread: ThreadRow
  turns: TurnRow[]
  items: ItemRow[]
  /** Older items exist before items[0]. */
  hasMore: boolean
}

export function timelineFromPage(page: ThreadPage): Timeline {
  return {
    thread: page.thread,
    turns: sortBySeq(page.turns),
    items: sortBySeq(page.items),
    hasMore: page.hasMore,
  }
}

/** Merges an older page fetched with beforeSeq = oldestSeq(t). */
export function prependPage(t: Timeline, page: ThreadPage): Timeline {
  const known = new Set(t.items.map((i) => i.id))
  const older = page.items.filter((i) => !known.has(i.id))
  return {
    ...t,
    thread: page.thread,
    turns: mergeBy(t.turns, page.turns),
    items: sortBySeq([...older, ...t.items]),
    hasMore: page.hasMore,
  }
}

/** Replaces the live state with a fresh first page, e.g. after a reconnect. */
export function refreshFromPage(t: Timeline | undefined, page: ThreadPage): Timeline {
  if (!t) return timelineFromPage(page)
  const fresh = timelineFromPage(page)
  const first = fresh.items[0]?.seq ?? Infinity
  // Keep already-loaded history older than the fresh page.
  const older = t.items.filter((i) => i.seq < first)
  return { ...fresh, items: [...older, ...fresh.items], hasMore: older.length > 0 ? t.hasMore : fresh.hasMore }
}

export function oldestSeq(t: Timeline): number | undefined {
  return t.items[0]?.seq
}

export function upsertTurn(t: Timeline, turn: TurnRow): Timeline {
  return { ...t, turns: mergeBy(t.turns, [turn]) }
}

export function upsertItem(t: Timeline, item: ItemRow): Timeline {
  return { ...t, items: mergeBy(t.items, [item]) }
}

/** Streams text into an item; deltas for unknown items are dropped because
 * item/started always precedes them and item/completed carries the full text. */
export function appendDelta(t: Timeline, itemId: string, delta: string): Timeline {
  const i = t.items.findIndex((it) => it.id === itemId)
  if (i < 0) return t
  const items = t.items.slice()
  const it = items[i]!
  items[i] = { ...it, text: (it.text ?? '') + delta }
  return { ...t, items }
}

export function setThread(t: Timeline, thread: ThreadRow): Timeline {
  return { ...t, thread }
}

export function activeTurn(t: Timeline): TurnRow | undefined {
  return t.turns.findLast((turn) => turn.status === 'inProgress')
}

export function queuedTurns(t: Timeline): TurnRow[] {
  return t.turns.filter((turn) => turn.status === 'queued')
}

export function latestTurn(t: Timeline): TurnRow | undefined {
  return t.turns.at(-1)
}

export interface TurnGroup {
  turn: TurnRow | undefined
  items: ItemRow[]
}

/** Groups loaded items under their turn, in turn order. Turns without loaded
 * items (older than the page, or queued) are left out. */
export function groupByTurn(t: Timeline): TurnGroup[] {
  const byTurn = new Map<string, ItemRow[]>()
  for (const it of t.items) {
    const list = byTurn.get(it.turnId)
    if (list) list.push(it)
    else byTurn.set(it.turnId, [it])
  }
  const groups: TurnGroup[] = []
  for (const turn of t.turns) {
    const items = byTurn.get(turn.id)
    if (!items) continue
    groups.push({ turn, items })
    byTurn.delete(turn.id)
  }
  for (const items of byTurn.values()) groups.push({ turn: undefined, items })
  return groups.sort((a, b) => (a.items[0]?.seq ?? 0) - (b.items[0]?.seq ?? 0))
}

function sortBySeq<T extends { seq: number }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.seq - b.seq)
}

function mergeBy<T extends { id: string; seq: number }>(rows: readonly T[], updates: readonly T[]): T[] {
  let out = rows.slice()
  let resort = false
  for (const u of updates) {
    const i = out.findIndex((r) => r.id === u.id)
    if (i >= 0) {
      out[i] = u
    } else {
      resort ||= out.length > 0 && out[out.length - 1]!.seq > u.seq
      out.push(u)
    }
  }
  if (resort) out = sortBySeq(out)
  return out
}
