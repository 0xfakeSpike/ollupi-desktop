// Reading tool-call items: what a call is waiting on, and what the built-in
// tools' arguments and results mean. Each rule mirrors the ollupi code named
// beside it; the argument and answer types are generated from ollupi.

import {
  BuiltinTool,
  type ItemRow,
  type PlanArguments,
  type SubagentArguments,
  type UserInputAnswer,
  type UserInputArguments,
} from '@ollupi/protocol'

export type ToolCall = ItemRow & { type: 'toolCall' }

export function isToolCall(item: ItemRow): item is ToolCall {
  return item.type === 'toolCall'
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

/** Arguments are stored as the JSON text the model produced. */
export function parseArguments(item: Pick<ItemRow, 'arguments'>): Record<string, unknown> {
  if (!item.arguments) return {}
  try {
    const v: unknown = JSON.parse(item.arguments)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export interface ShellCommand {
  program: string
  args: string[]
  workDir: string | undefined
  escalated: boolean
  justification: string | undefined
  /** True once ollupi froze the command for approval and execution. */
  prepared: boolean
}

/** run_command (tools/shell). After validation the call carries the frozen
 * execution, which is exactly what runs; before that only the model's
 * arguments exist (its ToolInputSchema). */
export function shellCommand(item: ItemRow): ShellCommand | undefined {
  if (item.tool !== BuiltinTool.Shell) return undefined
  const p = item.preparedExecution
  if (p?.program) {
    return { program: p.program, args: p.args ?? [], workDir: p.cwd, escalated: !!p.escalated, justification: p.justification, prepared: true }
  }
  const a = parseArguments(item)
  if (typeof a.program !== 'string') return undefined
  return {
    program: a.program,
    args: strings(a.args),
    workDir: str(a.work_dir),
    escalated: a.sandbox_permissions === 'require_escalated',
    justification: str(a.justification),
    prepared: false,
  }
}

export function commandLine(cmd: Pick<ShellCommand, 'program' | 'args'>): string {
  return [cmd.program, ...cmd.args].map(shellQuote).join(' ')
}

export interface ShellOutput {
  stdout: string
  stderr: string
  exitCode: number | undefined
  signal: string | undefined
  truncated: boolean
  sandboxDenials: string[]
}

/** The output map run_command returns (tools/shell Runner.Run). */
export function shellOutput(item: ItemRow): ShellOutput | undefined {
  const o = item.result?.output
  if (item.tool !== BuiltinTool.Shell || !o || typeof o !== 'object') return undefined
  const out = o as Record<string, unknown>
  return {
    stdout: str(out.stdout) ?? '',
    stderr: str(out.stderr) ?? '',
    exitCode: typeof out.exit_code === 'number' ? out.exit_code : undefined,
    signal: str(out.signal),
    truncated: out.truncated === true,
    sandboxDenials: strings(out.sandbox_denials),
  }
}

/** update_plan's arguments (tools/plan.Plan). */
export function planOf(item: ItemRow): PlanArguments | undefined {
  if (item.tool !== BuiltinTool.Plan) return undefined
  const a = parseArguments(item)
  return Array.isArray(a.plan) ? (a as unknown as PlanArguments) : undefined
}

export interface SubagentCall extends SubagentArguments {
  /** The thread the subagent runs in, once ollupi started it. */
  threadId: string | undefined
}

/** Agent's arguments (tools/subagent.Call) and the thread it runs in. */
export function subagentOf(item: ItemRow): SubagentCall | undefined {
  if (item.tool !== BuiltinTool.Subagent) return undefined
  const a = parseArguments(item)
  return { description: str(a.description) ?? '', prompt: str(a.prompt) ?? '', threadId: item.await?.threadId }
}

export interface QuestionAndAnswer {
  id: string
  header: string
  question: string
  answers: string[] | undefined
}

/** request_user_input: the questions (tools/userinput.Request, kept on the
 * call's await) and, once answered, the answers the agent stored as the
 * result (agent.answerUserInput). */
export function questionsOf(item: ItemRow): QuestionAndAnswer[] | undefined {
  if (item.tool !== BuiltinTool.UserInput) return undefined
  const request = (item.await?.request ?? parseArguments(item)) as Partial<UserInputArguments>
  if (!Array.isArray(request.questions)) return undefined
  const answers = (item.result?.output ?? {}) as Record<string, UserInputAnswer | undefined>
  return request.questions.map((q) => ({ id: q.id, header: q.header, question: q.question, answers: answers[q.id]?.answers }))
}

/** A one-line label for any tool call. */
export function toolTitle(item: ItemRow): string {
  const cmd = shellCommand(item)
  if (cmd) return commandLine(cmd)
  switch (item.tool) {
    case BuiltinTool.Plan:
      return 'Updated the plan'
    case BuiltinTool.UserInput:
      return 'Asked you'
    case BuiltinTool.Subagent:
      return subagentOf(item)?.description || 'Subagent'
    case BuiltinTool.ReadToolOutput:
      return 'Read earlier tool output'
  }
  return item.annotations?.title ?? item.tool ?? 'tool'
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}
