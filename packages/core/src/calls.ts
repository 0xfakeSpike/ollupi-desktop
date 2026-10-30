// Reading tool calls: what a call waits on, and which kind of call it is
// (ToolCall), with what the built-in tools' arguments and outputs say. The
// shapes are the contract's (builtinTools); a value is read as one only
// after it validates against the contract, since arguments are the model's
// own JSON text. Each kind has one view in the desktop.

import {
  isToolPart,
  type ApprovalRequestParams,
  type BuiltinToolName,
  type CommandOutput,
  type FileChange,
  type FileOutput,
  type Glob,
  type GlobOutput,
  type Grep,
  type GrepOutput,
  type ItemRow,
  type Plan,
  type Prepared,
  type ReadFile,
  type ReadFileOutput,
  type SubagentCall,
  type UserInputQuestion,
} from '@ollupi/protocol'
import type { Timeline } from './timeline'

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

/** What a call says about itself, wherever it is read from: a timeline
 * item, or the approval request the gateway sends before the item has run. */
interface CallFacts {
  tool: string | undefined
  /** The provider (cron, skills, memory) or MCP server the tool belongs to. */
  server: string | undefined
  /** The model's arguments, parsed; undefined when they are not JSON. */
  arguments: unknown
  prepared: Prepared | null | undefined
  output: unknown
  /** The thread a call that waits on another agent waits on. */
  threadId: string | undefined
  /** The MCP server's own title for the tool. */
  title: string | undefined
}

/** A call as the kind of thing it does, with what the contract types of
 * it. A built-in tool whose arguments do not match the contract is read as
 * any other tool: they are the model's own JSON text. */
export type ToolCall =
  | { kind: 'command'; command: FrozenCommand; output: CommandOutput | undefined }
  | { kind: 'file'; tool: FileTool; change: FileChange; output: FileOutput | undefined }
  | { kind: 'read'; args: ReadFile; output: ReadFileOutput | undefined }
  | { kind: 'glob'; args: Glob; output: GlobOutput | undefined }
  | { kind: 'grep'; args: Grep; output: GrepOutput | undefined }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'question'; questions: QuestionAndAnswer[] }
  | { kind: 'subagent'; task: SubagentTask }
  | { kind: 'tool'; name: string | undefined; server: string | undefined }

export type ToolKind = ToolCall['kind']

/** A timeline item's call. */
export function callOf(item: ItemRow): ToolCall {
  return classify({
    tool: item.tool,
    server: item.server,
    arguments: parseArguments(item),
    prepared: item.preparedExecution,
    output: item.result?.output,
    threadId: item.await?.threadId,
    title: item.annotations?.title,
  })
}

/** The thread's plan: ollupi keeps none of its own, and each update_plan
 * call replaces the whole plan, so it is the last loaded call that went
 * through, from any turn. One ollupi refused (an invalid plan) or the user
 * declined changed nothing. */
export function currentPlan(t: Timeline): { plan: Plan; item: ItemRow } | undefined {
  for (let i = t.items.length - 1; i >= 0; i--) {
    const item = t.items[i]!
    if (item.tool !== 'update_plan' || item.status !== 'completed') continue
    const call = callOf(item)
    if (call.kind === 'plan') return { plan: call.plan, item }
  }
  return undefined
}

/** The call an approval request asks about. It has not run, so has no
 * output yet. */
export function approvalCallOf(p: ApprovalRequestParams): ToolCall {
  return classify({
    tool: p.tool,
    server: p.server,
    arguments: p.arguments,
    prepared: p.preparedExecution,
    output: undefined,
    threadId: undefined,
    title: undefined,
  })
}

function classify(c: CallFacts): ToolCall {
  const builtin = c.tool as BuiltinToolName | undefined
  switch (builtin) {
    case 'run_command': {
      // ollupi freezes the command before approval and execution, and
      // exactly that runs. Before then the call has only the model's
      // arguments, which the contract does not type.
      const p = c.prepared
      if (!p?.program) break
      return { kind: 'command', command: { ...p, program: p.program }, output: isToolPart('run_command', 'output', c.output) ? c.output : undefined }
    }
    case 'edit_file':
    case 'write_file': {
      // Like a command, the change is frozen before approval: exactly this
      // diff is written, and only while the file is still as it was read.
      const change = c.prepared?.files?.[0]
      if (!change) break
      return { kind: 'file', tool: builtin, change, output: isToolPart(builtin, 'output', c.output) ? c.output : undefined }
    }
    case 'read_file':
      if (isToolPart('read_file', 'arguments', c.arguments)) return { kind: 'read', args: c.arguments, output: isToolPart('read_file', 'output', c.output) ? c.output : undefined }
      break
    case 'glob':
      if (isToolPart('glob', 'arguments', c.arguments)) return { kind: 'glob', args: c.arguments, output: isToolPart('glob', 'output', c.output) ? c.output : undefined }
      break
    case 'grep':
      if (isToolPart('grep', 'arguments', c.arguments)) return { kind: 'grep', args: c.arguments, output: isToolPart('grep', 'output', c.output) ? c.output : undefined }
      break
    case 'update_plan':
      if (isToolPart('update_plan', 'arguments', c.arguments)) return { kind: 'plan', plan: c.arguments }
      break
    case 'request_user_input': {
      if (!isToolPart('request_user_input', 'arguments', c.arguments)) break
      // Once answered, ollupi stores the answers as the result
      // (agent.answerUserInput); the contract allows a null answer.
      const answers = isToolPart('request_user_input', 'output', c.output) ? c.output : undefined
      return { kind: 'question', questions: c.arguments.questions.map((q) => ({ ...q, answers: answers?.[q.id]?.answers })) }
    }
    case 'Agent':
      if (isToolPart('Agent', 'arguments', c.arguments)) return { kind: 'subagent', task: { ...c.arguments, threadId: c.threadId } }
      break
  }
  return { kind: 'tool', name: c.title || c.tool || undefined, server: c.server || undefined }
}

/** The calls that only look at files: read_file, glob and grep. */
export type ReadCall = Extract<ToolCall, { kind: 'read' | 'glob' | 'grep' }>

export function isReadCall(call: ToolCall): call is ReadCall {
  return call.kind === 'read' || call.kind === 'glob' || call.kind === 'grep'
}

/** A timeline's items as drawn: one item, or a run of read calls next to
 * each other, which an agent makes many of while it looks around. */
export type ItemGroup = { kind: 'item'; item: ItemRow } | { kind: 'reads'; items: ItemRow[]; calls: ReadCall[] }

/** Puts two or more read calls in a row into one group. A call that waits
 * on the person (an ask rule) stays on its own, so its request shows. */
export function groupReads(items: readonly ItemRow[]): ItemGroup[] {
  const out: ItemGroup[] = []
  let run: { items: ItemRow[]; calls: ReadCall[] } = { items: [], calls: [] }
  const flush = () => {
    if (run.items.length === 1) out.push({ kind: 'item', item: run.items[0]! })
    else if (run.items.length > 1) out.push({ kind: 'reads', ...run })
    run = { items: [], calls: [] }
  }
  for (const item of items) {
    const call = item.type === 'toolCall' && !waitsForApproval(item) ? callOf(item) : undefined
    if (call && isReadCall(call)) {
      run.items.push(item)
      run.calls.push(call)
      continue
    }
    flush()
    out.push({ kind: 'item', item })
  }
  flush()
  return out
}

/** The text of a read_file window without its line numbers ("12\tcode"). */
export function readText(output: ReadFileOutput): string {
  return (output.text ?? '').replace(/^\d+\t/gm, '')
}

/** The tools that write a file: edit_file replaces parts of it, write_file
 * all of it. */
export type FileTool = Extract<BuiltinToolName, 'edit_file' | 'write_file'>

/** A call that writes a file that did not exist: before is the digest of
 * the file as read, and there was none. */
export function createsFile(change: FileChange): boolean {
  return change.before === undefined
}

/** The frozen execution of a command that has a program to run. */
export type FrozenCommand = Prepared & { program: string }

export function commandLine(p: Pick<Prepared, 'program' | 'args'>): string {
  return [p.program ?? '', ...(p.args ?? [])].map(shellQuote).join(' ')
}

/** A command that exits non-zero or is killed failed, though the call
 * itself completed. */
export function commandFailed(output: CommandOutput): boolean {
  return output.exit_code !== 0 || !!output.signal
}

export interface SubagentTask extends SubagentCall {
  /** The thread the subagent runs in, once ollupi started it. */
  threadId: string | undefined
}

export interface QuestionAndAnswer extends UserInputQuestion {
  /** The stored answer, once given; the contract allows null. */
  answers: string[] | null | undefined
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}
