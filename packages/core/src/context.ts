// What a thread's model calls put in the context window, as ollupi records
// it. Each call's prompt stats (ContextStats) and usage sit on exactly one
// item of that call: its answer, else its reasoning, else its first tool
// call; a call that failed before answering records an error item, and a
// compaction records them on its contextCompaction item.

import type { ContextStats, ItemRow, MemoryReference, MemoryStats, Usage } from '@ollupi/protocol'
import type { Timeline } from './timeline'

export interface ModelCall {
  itemId: string
  turnId: string
  /** compaction: the call that summarized earlier context; its prompt is
   * that history, not the conversation's next prompt. */
  kind: 'response' | 'failed' | 'compaction'
  stats: ContextStats
  usage: Usage | undefined
  startedAt: string
}

/** The loaded items' model calls, oldest first. */
export function modelCalls(t: Timeline): ModelCall[] {
  const calls: ModelCall[] = []
  for (const it of t.items) {
    if (!it.contextStats) continue
    calls.push({
      itemId: it.id,
      turnId: it.turnId,
      kind: it.type === 'contextCompaction' ? 'compaction' : it.type === 'error' ? 'failed' : 'response',
      stats: it.contextStats,
      usage: it.usage ?? undefined,
      startedAt: it.startedAt,
    })
  }
  return calls
}

/** The last call that sent the conversation itself, not a compaction. */
export function latestContextCall(calls: ModelCall[]): ModelCall | undefined {
  return calls.findLast((c) => c.kind !== 'compaction')
}

/** A prompt's share of the model's input budget. ollupi estimates each part
 * from its text and calibrates the total against the input tokens the API
 * reported for an earlier call; the parts are scaled to that total, as
 * ollupi scales them when deciding to compact. The memory snapshot is part
 * of messages. */
export interface ContextUse {
  used: number
  budget: number
  /** The size above which a turn compacts earlier context, when there is
   * enough of it. */
  compactAt: number
  system: number
  tools: number
  /** Messages other than the memory snapshot. */
  messages: number
  memory: number
  /** Whether the total is calibrated against the API, or only estimated. */
  calibrated: boolean
}

/** The factor from ollupi's estimate of a prompt to its calibrated size. */
function calibration(s: ContextStats): number {
  return s.estimatedTokens > 0 ? (s.calibratedTokens || s.estimatedTokens) / s.estimatedTokens : 1
}

export function contextUse(s: ContextStats): ContextUse {
  const used = s.calibratedTokens || s.estimatedTokens
  const k = calibration(s)
  const memory = Math.round((s.memoryTokens ?? 0) * k)
  const system = Math.round(s.systemTokens * k)
  const tools = Math.round(s.toolsTokens * k)
  return {
    used,
    budget: s.budgetTokens,
    compactAt: s.compactAtTokens,
    system,
    tools,
    messages: Math.max(0, used - system - tools - memory),
    memory,
    calibrated: !!s.calibratedTokens && s.calibratedTokens !== s.estimatedTokens,
  }
}

export interface MemorySection {
  /** The section's entries, scaled to the calibrated total like the parts
   * of ContextUse. */
  tokens: number
  ids: string[]
  /** The entries as the snapshot gave them, in its order; undefined when
   * the snapshot is in a part of the thread not loaded. */
  entries: MemoryReference[] | undefined
}

export interface PromptMemory {
  global: MemorySection | undefined
  workspace: MemorySection | undefined
}

/** The memory snapshot a call's prompt carried, in its two sections (global
 * and the workspace's), as ollupi reports it in the call's stats. A thread
 * loads its snapshot before its first model call and again after each
 * compaction, recording it as a memoryContext item: the call used the
 * latest one before it. Undefined for a call that carried no memory. */
export function promptMemory(t: Timeline, call: ModelCall): PromptMemory | undefined {
  const { globalMemory, workspaceMemory } = call.stats
  if (!globalMemory?.ids.length && !workspaceMemory?.ids.length) return undefined
  const at = t.items.findIndex((i) => i.id === call.itemId)
  const snapshot = t.items.findLast((i: ItemRow, n) => n < at && i.type === 'memoryContext' && i.status === 'completed')
  const section = (s: MemoryStats | null | undefined): MemorySection | undefined => {
    if (!s?.ids.length) return undefined
    const byId = new Map((snapshot?.memory ?? []).map((m) => [m.id, m]))
    const entries = s.ids.map((id) => byId.get(id))
    return { tokens: Math.round(s.tokens * calibration(call.stats)), ids: s.ids, entries: entries.every((e) => e !== undefined) ? entries : undefined }
  }
  return { global: section(globalMemory), workspace: section(workspaceMemory) }
}
