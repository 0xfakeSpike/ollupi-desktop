// Reading items: what a tool call means to a person (title, command, plan,
// result), independent of how a UI draws it. Knowledge of ollupi's built-in
// tool shapes lives here and nowhere else.

import type { ItemRow } from '@ollupi/protocol'

export const BuiltinTool = {
  Shell: 'run_command',
  Plan: 'update_plan',
  UserInput: 'request_user_input',
  Subagent: 'Agent',
  ReadToolOutput: 'read_tool_output',
} as const

export function parseArguments(item: Pick<ItemRow, 'arguments'>): Record<string, unknown> {
  if (!item.arguments) return {}
  try {
    const v = JSON.parse(item.arguments) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Mirrors ItemRow.WaitsForApproval on the server. */
export function waitsForApproval(item: ItemRow): boolean {
  return item.type === 'toolCall' && item.status === 'pending' && !!item.approval && !item.approval.decision
}

export function waitsForUser(item: ItemRow): boolean {
  return item.type === 'toolCall' && item.status === 'inProgress' && item.await?.by === 'user'
}

export interface ShellCommand {
  program: string
  args: string[]
  workDir?: string
  escalated: boolean
  justification?: string
}

export function shellCommand(item: ItemRow): ShellCommand | undefined {
  if (item.tool !== BuiltinTool.Shell) return undefined
  const prepared = item.preparedExecution
  const args = parseArguments(item)
  const program = prepared?.program ?? str(args.program)
  if (!program) return undefined
  return {
    program,
    args: prepared?.args ?? strings(args.args),
    workDir: prepared?.cwd ?? str(args.work_dir),
    escalated: prepared?.escalated ?? args.sandbox_permissions === 'require_escalated',
    justification: prepared?.justification ?? str(args.justification),
  }
}

export function commandLine(cmd: Pick<ShellCommand, 'program' | 'args'>): string {
  return [cmd.program, ...cmd.args].map(shellQuote).join(' ')
}

export interface ShellOutput {
  stdout: string
  stderr: string
  exitCode: number | undefined
  truncated: boolean
  sandboxDenials: string[]
}

export function shellOutput(item: ItemRow): ShellOutput | undefined {
  const out = item.result?.output
  if (!out || typeof out !== 'object') return undefined
  const o = out as Record<string, unknown>
  return {
    stdout: str(o.stdout) ?? '',
    stderr: str(o.stderr) ?? '',
    exitCode: typeof o.exit_code === 'number' ? o.exit_code : undefined,
    truncated: o.truncated === true,
    sandboxDenials: strings(o.sandbox_denials),
  }
}

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed'

export interface Plan {
  explanation?: string
  steps: { step: string; status: PlanStepStatus }[]
}

export function planOf(item: ItemRow): Plan | undefined {
  if (item.tool !== BuiltinTool.Plan) return undefined
  const args = parseArguments(item)
  if (!Array.isArray(args.plan)) return undefined
  const steps = args.plan.flatMap((s) => {
    if (!s || typeof s !== 'object') return []
    const { step, status } = s as Record<string, unknown>
    if (typeof step !== 'string') return []
    const st: PlanStepStatus = status === 'in_progress' || status === 'completed' ? status : 'pending'
    return [{ step, status: st }]
  })
  return { explanation: str(args.explanation), steps }
}

export interface SubagentTask {
  description: string
  prompt: string
  threadId?: string
}

export function subagentTask(item: ItemRow): SubagentTask | undefined {
  if (item.tool !== BuiltinTool.Subagent) return undefined
  const args = parseArguments(item)
  return {
    description: str(args.description) ?? 'Subagent',
    prompt: str(args.prompt) ?? '',
    threadId: item.await?.threadId,
  }
}

/** A one-line label for any tool call. */
export function toolTitle(item: ItemRow): string {
  const cmd = shellCommand(item)
  if (cmd) return commandLine(cmd)
  const task = subagentTask(item)
  if (task) return task.description
  if (item.tool === BuiltinTool.Plan) return 'Updated plan'
  if (item.tool === BuiltinTool.UserInput) return 'Asked for input'
  const title = item.annotations?.title ?? item.tool ?? 'tool'
  return item.server && item.server !== 'builtin' ? `${item.server} · ${title}` : title
}

/** Pretty JSON of a tool result, or the raw value as text. */
export function formatOutput(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
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
