// Reading tool-call items: what a call waits on, and what the built-in
// tools' arguments and outputs say. The shapes are the contract's
// (builtinTools); a value is read as one only after it validates against
// the contract, since arguments are the model's own JSON text.

import {
  isToolPart,
  type BuiltinToolName,
  type CommandOutput,
  type ItemRow,
  type MemoryReference,
  type Plan,
  type Prepared,
  type SubagentCall,
  type UserInputQuestion,
} from '@ollupi/protocol'

/** Whether the call is to the named built-in tool. The name must be one the
 * contract lists, which the compiler checks. */
export function isBuiltin(item: ItemRow, name: BuiltinToolName): boolean {
  return item.type === 'toolCall' && item.tool === name
}

/** repo.ItemRow.WaitsForApproval: approval happens before a call runs, so
 * only a pending call can wait on it. */
export function waitsForApproval(item: ItemRow): boolean {
  return item.type === 'toolCall' && item.status === 'pending' && !!item.approval && !item.approval.decision
}

/** repo.ItemRow.Awaits: a call that ran and is answered by someone else
 * stays inProgress until the answer arrives. */
function awaits(item: ItemRow, by: 'user' | 'agent'): boolean {
  return item.type === 'toolCall' && item.status === 'inProgress' && item.await?.by === by
}

/** Waiting for the user to answer request_user_input. */
export function waitsForAnswer(item: ItemRow): boolean {
  return awaits(item, 'user')
}

/** Waiting for the subagent it started to report. */
export function waitsForSubagent(item: ItemRow): boolean {
  return awaits(item, 'agent')
}

/** The model's arguments as JSON, or undefined when they do not parse. */
export function parseArguments(item: Pick<ItemRow, 'arguments'>): unknown {
  if (!item.arguments) return undefined
  try {
    return JSON.parse(item.arguments)
  } catch {
    return undefined
  }
}

/** The command a run_command call runs: ollupi freezes it before approval
 * and execution (preparedExecution), and exactly that runs. Before then the
 * call has only the model's arguments, which the contract does not type. */
export function frozenCommand(item: ItemRow): (Prepared & { program: string }) | undefined {
  const p = item.preparedExecution
  return isBuiltin(item, 'run_command') && p?.program ? { ...p, program: p.program } : undefined
}

export function commandLine(p: Pick<Prepared, 'program' | 'args'>): string {
  return [p.program ?? '', ...(p.args ?? [])].map(shellQuote).join(' ')
}

/** run_command's output, once it validates as CommandOutput. */
export function commandOutput(item: ItemRow): CommandOutput | undefined {
  const out = item.result?.output
  return isBuiltin(item, 'run_command') && isToolPart('run_command', 'output', out) ? out : undefined
}

/** update_plan's arguments. */
export function planOf(item: ItemRow): Plan | undefined {
  const a = parseArguments(item)
  return isBuiltin(item, 'update_plan') && isToolPart('update_plan', 'arguments', a) ? a : undefined
}

export interface MemorySearch {
  /** The words the model searched for, when its arguments give them. */
  query: string | undefined
  /** The memories found, best first, once the call returned them. */
  memories: MemoryReference[] | undefined
}

/** memory_search: the model's query (the contract does not type its
 * arguments) and its result. */
export function memorySearchOf(item: ItemRow): MemorySearch | undefined {
  if (!isBuiltin(item, 'memory_search')) return undefined
  const a = parseArguments(item) as { query?: unknown } | undefined
  const out = item.result?.output
  return {
    query: typeof a?.query === 'string' ? a.query : undefined,
    memories: isToolPart('memory_search', 'output', out) ? out.memories : undefined,
  }
}

export interface SubagentTask extends SubagentCall {
  /** The thread the subagent runs in, once ollupi started it. */
  threadId: string | undefined
}

/** Agent's arguments and the thread it runs in. */
export function subagentOf(item: ItemRow): SubagentTask | undefined {
  const a = parseArguments(item)
  if (!isBuiltin(item, 'Agent') || !isToolPart('Agent', 'arguments', a)) return undefined
  return { ...a, threadId: item.await?.threadId }
}

export interface QuestionAndAnswer extends UserInputQuestion {
  /** The stored answer, once given; the contract allows null. */
  answers: string[] | null | undefined
}

/** request_user_input: its questions (the call's arguments) and, once
 * answered, the answers ollupi stored as the result (agent.answerUserInput). */
export function questionsOf(item: ItemRow): QuestionAndAnswer[] | undefined {
  const a = parseArguments(item)
  if (!isBuiltin(item, 'request_user_input') || !isToolPart('request_user_input', 'arguments', a)) return undefined
  const out = item.result?.output
  const answers = isToolPart('request_user_input', 'output', out) ? out : undefined
  return (a.questions ?? []).map((q) => ({ ...q, answers: answers?.[q.id]?.answers }))
}

/** A one-line label for any tool call. */
export function toolTitle(item: ItemRow): string {
  const cmd = frozenCommand(item)
  if (cmd) return commandLine(cmd)
  if (isBuiltin(item, 'update_plan')) return 'Updated the plan'
  if (isBuiltin(item, 'request_user_input')) return 'Asked you'
  const search = memorySearchOf(item)
  if (search) return search.query ? `Searched memory for “${search.query}”` : 'Searched memory'
  const task = subagentOf(item)
  if (task) return task.description
  return item.annotations?.title || item.tool || 'tool'
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}
