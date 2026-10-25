// Tool calls: a one-line summary with status that expands into details, plus
// richer cards for the built-in tools (plan, subagent, questions). A pending
// approval or question is drawn inside the call it belongs to.

import {
  BuiltinTool,
  commandLine,
  duration,
  formatOutput,
  parseArguments,
  planOf,
  shellCommand,
  shellOutput,
  subagentTask,
  toolTitle,
  waitsForApproval,
  waitsForUser,
} from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Badge, cn, Disclosure, Spinner } from '@ollupi/ui'
import { Ban, Bot, Check, ChevronRight, Circle, CircleCheck, CircleDot, ListChecks, Terminal, Wrench, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { CodeBlock } from '../../../components/Markdown'
import { openThread } from '../../../services/actions/threads'
import { useCatalog } from '../../../stores/catalog'
import { usePendingRequest } from '../../../stores/requests'
import { ApprovalCard } from '../../requests/ApprovalCard'
import { UserInputCard } from '../../requests/UserInputCard'

export function ToolCall({ item }: { item: ItemRow }) {
  switch (item.tool) {
    case BuiltinTool.Plan:
      return <PlanCard item={item} />
    case BuiltinTool.Subagent:
      return <SubagentCard item={item} />
    case BuiltinTool.UserInput:
      return <UserInputCall item={item} />
    default:
      return <GenericCall item={item} />
  }
}

function GenericCall({ item }: { item: ItemRow }) {
  const cmd = shellCommand(item)
  return (
    <div className="flex flex-col gap-2">
      <Disclosure
        summary={
          <span className="flex min-w-0 items-center gap-2 text-[13px]">
            {cmd ? <Terminal size={13} className="shrink-0" /> : <Wrench size={13} className="shrink-0" />}
            <span className={cn('truncate', cmd && 'font-mono text-[12px]')}>{toolTitle(item)}</span>
            {cmd?.escalated && <Badge tone="warning">outside sandbox</Badge>}
          </span>
        }
        aside={<CallStatus item={item} />}
      >
        <div className="flex flex-col gap-2 pl-5">{cmd ? <ShellDetails item={item} /> : <JsonDetails item={item} />}</div>
      </Disclosure>
      <PendingApproval item={item} />
    </div>
  )
}

function CallStatus({ item }: { item: ItemRow }) {
  const time = item.completedAt ? duration(item.startedAt, item.completedAt) : ''
  const asking = usePendingRequest(item.id)?.kind === 'approval' || waitsForApproval(item)
  let mark: ReactNode
  switch (item.status) {
    // Approval happens before a call runs, so only a pending call can be
    // waiting on it; most pending calls are just about to run.
    case 'pending':
      mark = asking ? <Badge tone="warning">needs approval</Badge> : <Spinner size={13} />
      break
    case 'inProgress':
      mark = <Spinner size={13} />
      break
    case 'completed':
      mark = <Check size={14} className="text-success" />
      break
    case 'failed':
      mark = <X size={14} className="text-danger" />
      break
    case 'declined':
      mark = (
        <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
          <Ban size={12} /> declined
        </span>
      )
      break
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-fg-subtle">
      {time}
      {mark}
    </span>
  )
}

function ShellDetails({ item }: { item: ItemRow }) {
  const cmd = shellCommand(item)!
  const out = shellOutput(item)
  return (
    <>
      <CodeBlock code={commandLine(cmd)} language={cmd.workDir ? `sh · ${cmd.workDir}` : 'sh'} />
      {out && (out.stdout || out.stderr) && (
        <pre className="selectable max-h-80 overflow-auto rounded-lg bg-surface px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap">
          {out.stdout}
          {out.stderr && <span className="text-danger">{out.stderr}</span>}
        </pre>
      )}
      {out && (
        <div className="flex flex-wrap gap-1.5">
          {out.exitCode !== undefined && <Badge tone={out.exitCode === 0 ? 'success' : 'danger'}>exit {out.exitCode}</Badge>}
          {out.truncated && <Badge>output truncated</Badge>}
          {out.sandboxDenials.map((d) => (
            <Badge key={d} tone="warning">
              sandbox: {d}
            </Badge>
          ))}
        </div>
      )}
      {item.error && <ErrorText text={item.error} />}
    </>
  )
}

function JsonDetails({ item }: { item: ItemRow }) {
  const args = parseArguments(item)
  const output = formatOutput(item.result?.output)
  return (
    <>
      {Object.keys(args).length > 0 && <CodeBlock code={JSON.stringify(args, null, 2)} language="arguments" />}
      {output && <CodeBlock code={output} language="result" />}
      {item.error && <ErrorText text={item.error} />}
    </>
  )
}

function ErrorText({ text }: { text: string }) {
  return <div className="selectable text-[12px] break-words whitespace-pre-wrap text-danger">{text}</div>
}

function PendingApproval({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  if (request?.kind === 'approval') return <ApprovalCard request={request} />
  if (waitsForApproval(item)) return <div className="pl-5 text-xs text-fg-subtle">Waiting for approval…</div>
  return null
}

const stepIcon = {
  pending: <Circle size={14} className="text-fg-subtle" />,
  in_progress: <CircleDot size={14} className="text-accent" />,
  completed: <CircleCheck size={14} className="text-success" />,
}

function PlanCard({ item }: { item: ItemRow }) {
  const plan = planOf(item)
  if (!plan) return <GenericCall item={item} />
  const done = plan.steps.filter((s) => s.status === 'completed').length
  return (
    <div className="rounded-xl border border-line bg-surface/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg">
        <ListChecks size={14} />
        Plan
        <span className="text-xs font-normal text-fg-subtle">
          {done}/{plan.steps.length}
        </span>
      </div>
      {plan.explanation && <p className="mb-2 text-[13px] text-fg-muted">{plan.explanation}</p>}
      <ol className="flex flex-col gap-1.5">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <span className="mt-0.5">{stepIcon[s.status]}</span>
            <span className={cn(s.status === 'completed' ? 'text-fg-subtle line-through' : 'text-fg')}>{s.step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SubagentCard({ item }: { item: ItemRow }) {
  const task = subagentTask(item)!
  const childId = useCatalog((s) => task.threadId ?? s.threads.find((t) => t.parentItemId === item.id)?.id)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!childId}
        onClick={() => childId && void openThread(childId)}
        className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition enabled:hover:bg-hover"
      >
        <Bot size={16} className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-fg">{task.description}</div>
          <div className="truncate text-xs text-fg-subtle">{task.prompt}</div>
        </div>
        <CallStatus item={item} />
        {childId && <ChevronRight size={14} className="text-fg-subtle group-hover:text-fg" />}
      </button>
      <PendingApproval item={item} />
    </div>
  )
}

function UserInputCall({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  if (request?.kind === 'userInput') return <UserInputCard request={request} />
  if (waitsForUser(item)) return <div className="text-xs text-fg-subtle">Waiting for your answer…</div>
  return <GenericCall item={item} />
}
