// A turn as it reads: the person's words, the agent's process between
// them, and its answer. ollupi records each model call as one response:
// its reasoning, its text and the tool calls it asked for share a
// responseId (agent/runtime). A response that asks for tools is a step of
// the process, and its text says what the agent is about to do; ollupi
// runs those tools and calls the model again. A response that asks for none
// ends the turn, and its text is the answer. So the answer is the latest
// response's text while that response has asked for nothing: settled once
// the turn has ended, and while a response streams, the text it has so far
// (it moves into the process if tool calls follow).

import type { ItemRow } from '@ollupi/protocol'
import { callOf } from './calls'

export type TurnPart =
  /** The person's words: the turn's input, or a message steered into it. */
  | { kind: 'message'; item: ItemRow }
  /** The agent's process between them: reasoning, the text of responses
   * that asked for tools, the tool calls, memory loads, compactions and
   * errors, in the order they happened. */
  | { kind: 'process'; items: ItemRow[] }
  /** The text of the response that asked for no tools. */
  | { kind: 'answer'; item: ItemRow }

/** The items a model call records under its responseId. A compaction has
 * a responseId of its own, but it is not a step of the process. */
function isResponseItem(item: ItemRow): boolean {
  return !!item.responseId && (item.type === 'reasoning' || item.type === 'agentMessage' || item.type === 'toolCall' || item.type === 'error')
}

/** The latest response's text, while that response asked for no tools. */
export function answerOf(items: readonly ItemRow[]): ItemRow | undefined {
  const latest = items.findLast(isResponseItem)?.responseId
  if (!latest) return undefined
  const response = items.filter((i) => i.responseId === latest)
  if (response.some((i) => i.type === 'toolCall')) return undefined
  return response.find((i) => i.type === 'agentMessage')
}

/** A turn's items (in seq order) as messages, processes and the answer. */
export function layoutTurn(items: readonly ItemRow[]): TurnPart[] {
  const answer = answerOf(items)
  const parts: TurnPart[] = []
  let process: ItemRow[] = []
  const flush = () => {
    if (process.length > 0) parts.push({ kind: 'process', items: process })
    process = []
  }
  for (const item of items) {
    if (item.type === 'userMessage') {
      flush()
      parts.push({ kind: 'message', item })
    } else if (item === answer) {
      flush()
      parts.push({ kind: 'answer', item })
    } else {
      process.push(item)
    }
  }
  flush()
  return parts
}

/** What a process did, by kind of call, for the line it folds into. */
export interface ProcessSummary {
  commands: number
  /** Distinct files edited or written, by the calls that went through. */
  filesChanged: number
  /** Those files' paths, as the calls named them, in the order first changed. */
  changedPaths: string[]
  /** Lines those calls added and removed, as their diffs count them. */
  linesAdded: number
  linesRemoved: number
  reads: number
  /** glob and grep calls. */
  searches: number
  subagents: number
  /** Any other tool: MCP, web_fetch, the browser's. */
  tools: number
  startedAt: string
  /** When its last item ended; undefined while one has not. */
  completedAt: string | undefined
}

export function summarizeProcess(items: readonly ItemRow[]): ProcessSummary {
  const summary: ProcessSummary = {
    commands: 0,
    filesChanged: 0,
    changedPaths: [],
    linesAdded: 0,
    linesRemoved: 0,
    reads: 0,
    searches: 0,
    subagents: 0,
    tools: 0,
    startedAt: items[0]?.startedAt ?? '',
    completedAt: undefined,
  }
  const changed = new Set<string>()
  for (const item of items) {
    if (item.type !== 'toolCall') continue
    const call = callOf(item)
    switch (call.kind) {
      case 'command':
        summary.commands++
        break
      case 'file':
        // A declined or failed change wrote nothing.
        if (item.status !== 'completed') break
        changed.add(call.change.path)
        summary.linesAdded += call.change.added
        summary.linesRemoved += call.change.removed
        break
      case 'read':
        summary.reads++
        break
      case 'glob':
      case 'grep':
        summary.searches++
        break
      case 'subagent':
        summary.subagents++
        break
      case 'tool':
        summary.tools++
        break
      case 'plan':
      case 'question':
        // The plan has a panel of its own, and a question was the person's.
        break
    }
  }
  summary.filesChanged = changed.size
  summary.changedPaths = [...changed]
  if (items.every((i) => i.completedAt)) summary.completedAt = items.map((i) => i.completedAt!).reduce((a, b) => (a > b ? a : b), '')
  return summary
}
