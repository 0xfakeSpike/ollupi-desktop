// The row most calls share: icon, title and state, opening into the
// call's details, with the request it waits on below it.

import { waitsForAnswer, waitsForApproval, waitsForSubagent, formatValue, parseArguments } from '@ollupi/core'
import type { ApprovalRequestParams, ItemRow } from '@ollupi/protocol'
import { Badge, cn, ProcessRow, Spinner } from '@ollupi/ui'
import { Ban, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePendingRequest, type PendingRequest } from '../../../domains/requests'
import { useT, type Messages } from '../../../i18n'
import { duration } from '../../../i18n/format'
import { CodeBlock } from '../../common/Markdown'
import { ApprovalCard } from '../../requests/ApprovalCard'
import { QuestionsCard } from '../../requests/QuestionsCard'

export function CallRow({
  item,
  icon: Icon,
  title,
  badge,
  failure,
  children,
  after,
}: {
  item: ItemRow
  icon: LucideIcon
  title: ReactNode
  badge?: ReactNode
  failure: string | undefined
  children?: ReactNode
  /** Shown below the row and its pending request. */
  after?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <ProcessRow
        icon={<Icon size={14} className={cn(failure && 'text-danger')} />}
        title={title}
        badge={badge}
        meta={<CallMeta item={item} failure={failure} />}
      >
        {children}
      </ProcessRow>
      <PendingHere item={item} />
      {after}
    </div>
  )
}

/** The call's duration and state as ollupi records it (see ItemStatus).
 * Success is the norm and carries no mark. */
function CallMeta({ item, failure }: { item: ItemRow; failure: string | undefined }) {
  const approvalAsked = usePendingRequest(item.id)?.kind === 'approval'
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
    case 'failed':
      mark = failure && <span className="text-danger">{failure}</span>
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

/** A call failed when ollupi recorded it so. */
export function statusFailure(m: Messages, item: ItemRow): string | undefined {
  return item.status === 'failed' ? m.conversation.tool.failed : undefined
}

/** The request this call waits on, once the gateway has sent it. */
function PendingHere({ item }: { item: ItemRow }) {
  const request = usePendingRequest(item.id)
  const m = useT()
  if (request) return <RequestCard request={request} />
  if (waitsForApproval(item)) return <div className="pl-5 text-small text-fg-subtle">{m.conversation.tool.waitingApproval}</div>
  return null
}

export function RequestCard({ request }: { request: PendingRequest }) {
  return request.kind === 'approval' ? <ApprovalCard request={request} /> : <QuestionsCard request={request} />
}

export function ArgumentsAndResult({ item }: { item: ItemRow }) {
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

export function ErrorText({ text }: { text: string }) {
  return <div className="selectable text-small break-words whitespace-pre-wrap text-danger">{text}</div>
}

/** An approval of any call: the tool's name and the arguments the model
 * gave. */
export const argumentsApproval = {
  title: (m: Messages, _call: unknown, params: ApprovalRequestParams) => m.requests.approval.tool(params.tool),
  Body: ArgumentsApproval,
}

function ArgumentsApproval({ params }: { params: ApprovalRequestParams }) {
  const m = useT()
  return (
    <CodeBlock
      code={JSON.stringify(params.arguments, null, 2)}
      label={params.server ? m.requests.approval.serverArguments(params.server) : m.requests.approval.arguments}
    />
  )
}
