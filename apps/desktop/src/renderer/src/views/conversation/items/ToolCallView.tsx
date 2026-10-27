// Tool calls: a one-line summary with its state that expands into details,
// and dedicated cards for the built-in tools. A pending approval or question
// is shown at the call it belongs to.

import {
  commandLine,
  commandOutput,
  formatValue,
  frozenCommand,
  isBuiltin,
  memorySearchOf,
  parseArguments,
  planOf,
  questionsOf,
  subagentOf,
  waitsForAnswer,
  waitsForApproval,
  waitsForSubagent,
} from '@ollupi/core'
import type { ItemRow, MemoryReference } from '@ollupi/protocol'
import { Badge, cn, Disclosure, Spinner } from '@ollupi/ui'
import { Ban, Bot, Brain, Check, ChevronRight, Circle, CircleCheck, CircleDot, ListChecks, MessageCircleQuestion, Terminal, Wrench, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { openThread } from '../../../domains/conversation'
import { usePendingRequest, useThreadRequests, type PendingRequest } from '../../../domains/requests'
import { useT } from '../../../i18n'
import { duration, toolTitle } from '../../../i18n/format'
import { CodeBlock } from '../../common/Markdown'
import { MemoryGroups } from './SystemItems'
import { ApprovalCard } from '../../requests/ApprovalCard'
import { QuestionsCard } from '../../requests/QuestionsCard'

export function ToolCallView({ item }: { item: ItemRow }) {
  if (isBuiltin(item, 'update_plan')) return <PlanCard item={item} />
  if (isBuiltin(item, 'Agent')) return <SubagentCard item={item} />
  if (isBuiltin(item, 'request_user_input')) return <QuestionCall item={item} />
  return <GenericCall item={item} />
}

function GenericCall({ item }: { item: ItemRow }) {
  const cmd = frozenCommand(item)
  const search = memorySearchOf(item)
  const m = useT()
  return (
    <div className="flex flex-col gap-2">
      <Disclosure
        summary={
          <span className="flex min-w-0 items-center gap-2 text-[13px]">
            {cmd ? (
              <Terminal size={13} className="shrink-0" />
            ) : search ? (
              <Brain size={13} className="shrink-0" />
            ) : (
              <Wrench size={13} className="shrink-0" />
            )}
            <span className={cn('truncate', cmd && 'font-mono text-[12px]')}>{toolTitle(m, item)}</span>
            {cmd?.escalated && <Badge tone="warning">{m.conversation.tool.outsideSandbox}</Badge>}
          </span>
        }
        aside={<CallState item={item} />}
      >
        <div className="flex flex-col gap-2 pl-5">
          {cmd ? <ShellDetails item={item} /> : search?.memories ? <SearchResults memories={search.memories} /> : <ArgumentsAndResult item={item} />}
        </div>
      </Disclosure>
      <PendingHere item={item} />
    </div>
  )
}

/** The call's state as ollupi records it (see ItemStatus). */
function CallState({ item }: { item: ItemRow }) {
  const approvalAsked = usePendingRequest(item.id)?.kind === 'approval'
  const m = useT()
  let mark: ReactNode
  switch (item.status) {
    case 'pending':
      // Validated and frozen, but not run: either it waits for approval or
      // it is about to run.
      mark = approvalAsked || waitsForApproval(item) ? <Badge tone="warning">{m.conversation.tool.needsApproval}</Badge> : <Spinner size={13} />
      break
    case 'inProgress':
      mark = waitsForAnswer(item) ? (
        <Badge tone="accent">{m.conversation.tool.waiting}</Badge>
      ) : waitsForSubagent(item) ? (
        <Badge>{m.conversation.tool.subagentWorking}</Badge>
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
          <Ban size={12} /> {m.conversation.tool.declined}
        </span>
      )
      break
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-fg-subtle">
      {item.completedAt && duration(m, item.startedAt, item.completedAt)}
      {mark}
    </span>
  )
}

function ShellDetails({ item }: { item: ItemRow }) {
  const cmd = frozenCommand(item)!
  const out = commandOutput(item)
  const m = useT()
  return (
    <>
      <CodeBlock code={commandLine(cmd)} label={`sh · ${cmd.cwd}`} />
      {out && (out.stdout || out.stderr) && (
        <pre className="selectable max-h-80 overflow-auto rounded-lg bg-surface px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap">
          {out.stdout}
          {out.stderr && <span className="text-danger">{out.stderr}</span>}
        </pre>
      )}
      {out && (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={out.exit_code === 0 ? 'success' : 'danger'}>{m.conversation.tool.exit(out.exit_code)}</Badge>
          {out.signal && <Badge tone="danger">{out.signal}</Badge>}
          {out.truncated && <Badge>{m.conversation.tool.truncated}</Badge>}
          {(out.sandbox_denials ?? []).map((d) => (
            <Badge key={d} tone="warning">
              {m.conversation.tool.sandboxDenial(d)}
            </Badge>
          ))}
        </div>
      )}
      {item.error && <ErrorText text={item.error} />}
    </>
  )
}

/** What memory_search found, by the scope each memory carries. */
function SearchResults({ memories }: { memories: MemoryReference[] }) {
  const m = useT()
  if (memories.length === 0) return <div className="text-xs text-fg-subtle">{m.conversation.tool.noMemories}</div>
  return <MemoryGroups memories={memories} />
}

function ArgumentsAndResult({ item }: { item: ItemRow }) {
  // Arguments that are not valid JSON are shown as the model wrote them.
  const args = parseArguments(item)
  const shown = args === undefined ? item.arguments : JSON.stringify(args, null, 2)
  const output = formatValue(item.result?.output)
  const m = useT()
  return (
    <>
      {shown && <CodeBlock code={shown} label={m.conversation.tool.arguments} />}
      {output && <CodeBlock code={output} label={m.conversation.tool.result} />}
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
  const m = useT()
  if (request) return <RequestCard request={request} />
  if (waitsForApproval(item)) return <div className="pl-5 text-xs text-fg-subtle">{m.conversation.tool.waitingApproval}</div>
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
  const m = useT()
  if (!plan) return <GenericCall item={item} />
  const steps = plan.plan ?? []
  const done = steps.filter((s) => s.status === 'completed').length
  return (
    <div className="rounded-xl border border-line bg-surface/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg">
        <ListChecks size={14} /> {m.conversation.tool.plan}
        <span className="text-xs font-normal text-fg-subtle">
          {done}/{steps.length}
        </span>
      </div>
      {plan.explanation && <p className="mb-2 text-[13px] text-fg-muted">{plan.explanation}</p>}
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
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
  const m = useT()
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
              {q.answers?.join(', ') ?? (waitsForAnswer(item) ? m.conversation.tool.waitingAnswer : item.error || m.conversation.tool.notAnswered)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
