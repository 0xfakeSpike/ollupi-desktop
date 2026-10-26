// Tool calls: a one-line summary with its state that expands into details,
// and dedicated cards for the built-in tools. A pending approval or question
// is shown at the call it belongs to.

import {
  commandLine,
  duration,
  formatValue,
  parseArguments,
  planOf,
  questionsOf,
  shellCommand,
  shellOutput,
  subagentOf,
  toolTitle,
  waitsForAnswer,
  waitsForApproval,
  waitsForSubagent,
} from '@ollupi/core'
import { BuiltinTool, type ItemRow } from '@ollupi/protocol'
import { Badge, cn, Disclosure, Spinner } from '@ollupi/ui'
import { Ban, Bot, Check, ChevronRight, Circle, CircleCheck, CircleDot, ListChecks, MessageCircleQuestion, Terminal, Wrench, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { openThread } from '../../../domains/conversation'
import { usePendingRequest, useThreadRequests, type PendingRequest } from '../../../domains/requests'
import { CodeBlock } from '../../common/Markdown'
import { ApprovalCard } from '../../requests/ApprovalCard'
import { QuestionsCard } from '../../requests/QuestionsCard'

export function ToolCallView({ item }: { item: ItemRow }) {
  switch (item.tool) {
    case BuiltinTool.Plan:
      return <PlanCard item={item} />
    case BuiltinTool.Subagent:
      return <SubagentCard item={item} />
    case BuiltinTool.UserInput:
      return <QuestionCall item={item} />
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
        aside={<CallState item={item} />}
      >
        <div className="flex flex-col gap-2 pl-5">{cmd ? <ShellDetails item={item} /> : <ArgumentsAndResult item={item} />}</div>
      </Disclosure>
      <PendingHere item={item} />
    </div>
  )
}

/** The call's state as ollupi records it (see ItemStatus). */
function CallState({ item }: { item: ItemRow }) {
  const approvalAsked = usePendingRequest(item.id)?.kind === 'approval'
  let mark: ReactNode
  switch (item.status) {
    case 'pending':
      // Validated and frozen, but not run: either it waits for approval or
      // it is about to run.
      mark = approvalAsked || waitsForApproval(item) ? <Badge tone="warning">needs approval</Badge> : <Spinner size={13} />
      break
    case 'inProgress':
      mark = waitsForAnswer(item) ? (
        <Badge tone="accent">waiting for you</Badge>
      ) : waitsForSubagent(item) ? (
        <Badge>subagent working</Badge>
      ) : (
        <Spinner size={13} />
      )
      break
    case 'completed':
      mark = <Check size={14} className="text-success" />
      break
    case 'failed':
      mark = <X size={14} className="text-danger" />
      break
    case 'declined':
      mark = (
        <span className="flex items-center gap-1">
          <Ban size={12} /> declined
        </span>
      )
      break
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-fg-subtle">
      {item.completedAt && duration(item.startedAt, item.completedAt)}
      {mark}
    </span>
  )
}

function ShellDetails({ item }: { item: ItemRow }) {
  const cmd = shellCommand(item)!
  const out = shellOutput(item)
  return (
    <>
      <CodeBlock code={commandLine(cmd)} label={cmd.workDir ? `sh · ${cmd.workDir}` : 'sh'} />
      {out && (out.stdout || out.stderr) && (
        <pre className="selectable max-h-80 overflow-auto rounded-lg bg-surface px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap">
          {out.stdout}
          {out.stderr && <span className="text-danger">{out.stderr}</span>}
        </pre>
      )}
      {out && (
        <div className="flex flex-wrap gap-1.5">
          {out.exitCode !== undefined && <Badge tone={out.exitCode === 0 ? 'success' : 'danger'}>exit {out.exitCode}</Badge>}
          {out.signal && <Badge tone="danger">{out.signal}</Badge>}
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

function ArgumentsAndResult({ item }: { item: ItemRow }) {
  const args = parseArguments(item)
  const output = formatValue(item.result?.output)
  return (
    <>
      {Object.keys(args).length > 0 && <CodeBlock code={JSON.stringify(args, null, 2)} label="arguments" />}
      {output && <CodeBlock code={output} label="result" />}
      {item.error && <ErrorText text={item.error} />}
    </>
  )
}

function ErrorText({ text }: { text: string }) {
  return <div className="selectable text-[12px] break-words whitespace-pre-wrap text-danger">{text}</div>
}

/** The request this call waits on, once the gateway has sent it. */
function PendingHere({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  if (request) return <RequestCard request={request} />
  if (waitsForApproval(item)) return <div className="pl-5 text-xs text-fg-subtle">Waiting for approval…</div>
  return null
}

function RequestCard({ request }: { request: PendingRequest }) {
  return request.kind === 'approval' ? <ApprovalCard request={request} /> : <QuestionsCard request={request} />
}

const stepIcon = {
  pending: <Circle size={14} className="text-fg-subtle" />,
  in_progress: <CircleDot size={14} className="text-accent" />,
  completed: <CircleCheck size={14} className="text-success" />,
}

function PlanCard({ item }: { item: ItemRow }) {
  const plan = planOf(item)
  if (!plan) return <GenericCall item={item} />
  const done = plan.plan.filter((s) => s.status === 'completed').length
  return (
    <div className="rounded-xl border border-line bg-surface/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg">
        <ListChecks size={14} /> Plan
        <span className="text-xs font-normal text-fg-subtle">
          {done}/{plan.plan.length}
        </span>
      </div>
      {plan.explanation && <p className="mb-2 text-[13px] text-fg-muted">{plan.explanation}</p>}
      <ol className="flex flex-col gap-1.5">
        {plan.plan.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <span className="mt-0.5">{stepIcon[s.status]}</span>
            <span className={s.status === 'completed' ? 'text-fg-subtle line-through' : 'text-fg'}>{s.step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A subagent's call. Its thread's requests are answered here, since this
 * thread reports the subagent's wait as its own status. */
function SubagentCard({ item }: { item: ItemRow }) {
  const task = subagentOf(item)!
  const childRequests = useThreadRequests(task.threadId)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!task.threadId}
        onClick={() => task.threadId && void openThread(task.threadId)}
        className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition enabled:hover:bg-hover"
      >
        <Bot size={16} className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-fg">{task.description}</div>
          <div className="truncate text-xs text-fg-subtle">{task.prompt}</div>
        </div>
        <CallState item={item} />
        {task.threadId && <ChevronRight size={14} className="text-fg-subtle group-hover:text-fg" />}
      </button>
      <PendingHere item={item} />
      {childRequests.map((r) => (
        <RequestCard key={r.params.itemId} request={r} />
      ))}
    </div>
  )
}

function QuestionCall({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  if (request?.kind === 'question') return <QuestionsCard request={request} />
  const qa = questionsOf(item)
  if (!qa) return <GenericCall item={item} />
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
      {qa.map((q) => (
        <div key={q.id} className="flex items-start gap-2 text-[13px]">
          <MessageCircleQuestion size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
          <div className="min-w-0">
            <div className="text-fg-muted">{q.question}</div>
            <div className="selectable text-fg">
              {q.answers?.join(', ') ?? (waitsForAnswer(item) ? 'Waiting for your answer…' : item.error || 'Not answered')}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
