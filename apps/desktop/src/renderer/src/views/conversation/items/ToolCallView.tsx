// Tool calls: a process row with its state that opens into details, and a
// plan block for update_plan. A pending approval or question is shown at
// the call it belongs to.

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
import { Badge, Block, Button, cn, ProcessRow, Spinner } from '@ollupi/ui'
import { ArrowUpRight, Ban, Bot, Brain, Circle, CircleCheck, CircleDot, ListChecks, MessageCircleQuestion, Terminal, Wrench } from 'lucide-react'
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
  if (isBuiltin(item, 'update_plan')) return <PlanBlock item={item} />
  if (isBuiltin(item, 'Agent')) return <SubagentCall item={item} />
  if (isBuiltin(item, 'request_user_input')) return <QuestionCall item={item} />
  return <GenericCall item={item} />
}

/** A command that exits non-zero or is killed failed, though the call
 * itself completed. */
function failed(item: ItemRow): boolean {
  const out = commandOutput(item)
  return item.status === 'failed' || (!!out && (out.exit_code !== 0 || !!out.signal))
}

function GenericCall({ item }: { item: ItemRow }) {
  const cmd = frozenCommand(item)
  const search = memorySearchOf(item)
  const m = useT()
  const Icon = cmd ? Terminal : search ? Brain : Wrench
  return (
    <div className="flex flex-col gap-2">
      <ProcessRow
        icon={<Icon size={14} className={cn(failed(item) && 'text-danger')} />}
        title={<span className={cn(cmd && 'font-mono text-small')}>{toolTitle(m, item)}</span>}
        badge={cmd?.escalated && <Badge tone="warning">{m.conversation.tool.outsideSandbox}</Badge>}
        meta={<CallMeta item={item} />}
      >
        {cmd ? <ShellDetails item={item} /> : search?.memories ? <SearchResults memories={search.memories} /> : <ArgumentsAndResult item={item} />}
      </ProcessRow>
      <PendingHere item={item} />
    </div>
  )
}

/** The call's duration and state as ollupi records it (see ItemStatus).
 * Success is the norm and carries no mark. */
function CallMeta({ item }: { item: ItemRow }) {
  const approvalAsked = usePendingRequest(item.id)?.kind === 'approval'
  const out = commandOutput(item)
  const m = useT()
  let mark: ReactNode
  switch (item.status) {
    case 'pending':
      // Validated and frozen, but not run: an approval waiting below says
      // so itself; otherwise it is about to run.
      mark = approvalAsked || waitsForApproval(item) ? null : <Spinner size={14} />
      break
    case 'inProgress':
      mark = waitsForAnswer(item) ? (
        <Badge tone="accent">{m.conversation.tool.waiting}</Badge>
      ) : waitsForSubagent(item) ? (
        <>
          <Spinner size={14} /> {m.conversation.tool.subagentWorking}
        </>
      ) : (
        <Spinner size={14} />
      )
      break
    case 'completed':
      mark = failed(item) && out && <span className="text-danger">{out.signal ?? m.conversation.tool.exit(out.exit_code)}</span>
      break
    case 'failed':
      mark = <span className="text-danger">{out ? m.conversation.tool.exit(out.exit_code) : m.conversation.tool.failed}</span>
      break
    case 'declined':
      mark = (
        <span className="flex items-center gap-1 text-fg-muted">
          <Ban size={14} /> {m.conversation.tool.declined}
        </span>
      )
      break
  }
  return (
    <>
      {item.completedAt && duration(m, item.startedAt, item.completedAt)}
      {mark}
    </>
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
        <Block>
          <pre className="selectable max-h-80 overflow-auto font-mono text-ui whitespace-pre-wrap">
            {out.stdout}
            {out.stderr && <span className="text-danger">{out.stderr}</span>}
          </pre>
        </Block>
      )}
      {out && (
        <div className="flex flex-wrap gap-x-1.5 text-small text-fg-subtle">
          {[
            <span key="exit" className={cn(out.exit_code !== 0 && 'text-danger')}>
              {m.conversation.tool.exit(out.exit_code)}
            </span>,
            out.signal && (
              <span key="signal" className="text-danger">
                {out.signal}
              </span>
            ),
            out.truncated && <span key="truncated">{m.conversation.tool.truncated}</span>,
            ...(out.sandbox_denials ?? []).map((d) => (
              <span key={d} className="text-warning">
                {m.conversation.tool.sandboxDenial(d)}
              </span>
            )),
          ]
            .filter(Boolean)
            .flatMap((fact, i) => (i === 0 ? [fact] : [<span key={`dot${i}`}>·</span>, fact]))}
        </div>
      )}
      {item.error && <ErrorText text={item.error} />}
    </>
  )
}

/** What memory_search found, by the scope each memory carries. */
function SearchResults({ memories }: { memories: MemoryReference[] }) {
  const m = useT()
  if (memories.length === 0) return <div className="text-small text-fg-subtle">{m.conversation.tool.noMemories}</div>
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
  return <div className="selectable text-small break-words whitespace-pre-wrap text-danger">{text}</div>
}

/** The request this call waits on, once the gateway has sent it. */
function PendingHere({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  const m = useT()
  if (request) return <RequestCard request={request} />
  if (waitsForApproval(item)) return <div className="pl-5 text-small text-fg-subtle">{m.conversation.tool.waitingApproval}</div>
  return null
}

function RequestCard({ request }: { request: PendingRequest }) {
  return request.kind === 'approval' ? <ApprovalCard request={request} /> : <QuestionsCard request={request} />
}

// Steps differ by shape and weight, not colour.
const steps = {
  pending: { icon: <Circle size={14} className="text-fg-subtle" />, text: 'text-fg' },
  in_progress: { icon: <CircleDot size={14} className="text-fg" />, text: 'text-fg' },
  completed: { icon: <CircleCheck size={14} className="text-fg-subtle" />, text: 'text-fg-subtle' },
}

function PlanBlock({ item }: { item: ItemRow }) {
  const plan = planOf(item)
  const m = useT()
  if (!plan) return <GenericCall item={item} />
  const list = plan.plan ?? []
  const done = list.filter((s) => s.status === 'completed').length
  return (
    <Block
      label={
        <span className="flex items-center gap-1.5">
          <ListChecks size={14} /> {m.conversation.tool.plan}
          <span className="tabular-nums">
            {done}/{list.length}
          </span>
        </span>
      }
    >
      {plan.explanation && <p className="selectable text-ui text-fg-muted">{plan.explanation}</p>}
      <ol className="flex flex-col gap-1">
        {list.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-ui">
            <span className="mt-0.75 flex shrink-0">{steps[s.status].icon}</span>
            <span className={cn('selectable', steps[s.status].text)}>{s.step}</span>
          </li>
        ))}
      </ol>
    </Block>
  )
}

/** A subagent's call. Its thread's requests are answered here, since this
 * thread reports the subagent's wait as its own status. */
function SubagentCall({ item }: { item: ItemRow }) {
  const task = subagentOf(item)!
  const childRequests = useThreadRequests(task.threadId)
  const m = useT()
  return (
    <div className="flex flex-col gap-2">
      <ProcessRow icon={<Bot size={14} className={cn(failed(item) && 'text-danger')} />} title={task.description} meta={<CallMeta item={item} />}>
        <p className="selectable text-ui break-words whitespace-pre-wrap text-fg-muted">{task.prompt}</p>
        {task.threadId && (
          <div>
            <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => void openThread(task.threadId!)}>
              {m.conversation.tool.openSubagent}
            </Button>
          </div>
        )}
      </ProcessRow>
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
  const answered = qa.every((q) => q.answers)
  const title = answered ? m.conversation.tool.answered(qa.length) : waitsForAnswer(item) ? m.conversation.tool.waitingAnswer : item.error || m.conversation.tool.notAnswered
  return (
    <ProcessRow icon={<MessageCircleQuestion size={14} />} title={title} meta={item.completedAt && duration(m, item.startedAt, item.completedAt)}>
      <dl className="flex flex-col gap-2">
        {qa.map((q) => (
          <div key={q.id}>
            <dt className="text-small text-fg-subtle">{q.question}</dt>
            <dd className="selectable text-ui text-fg">{q.answers?.join(', ') ?? m.conversation.tool.notAnswered}</dd>
          </div>
        ))}
      </dl>
    </ProcessRow>
  )
}
