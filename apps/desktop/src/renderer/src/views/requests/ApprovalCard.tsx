// Asks to allow one tool call, which the view of its kind words and shows
// (a command its frozen execution). A call that leaves the sandbox is the
// dangerous tier: it says what that means, its primary action says so too,
// and it can only be allowed once. Where an allow rule would let the same
// call run, ollupi suggests one: always allowing saves it, and the card says
// what it adds and where.

import { approvalCallOf } from '@ollupi/core'
import type { Decision, ThreadRow } from '@ollupi/protocol'
import { ActionCard, Button, type ButtonProps } from '@ollupi/ui'
import { ShieldAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useTimeline } from '../../domains/conversation'
import type { PendingRequest } from '../../domains/requests'
import { useWorkspace } from '../../domains/workspaces'
import { useT, type Messages } from '../../i18n'
import { viewOf } from '../conversation/tools'

// Decline first, the primary action last.
const order: Decision[] = ['decline', 'acceptForSession', 'acceptAlways', 'accept']

export function ApprovalCard({ request }: { request: Extract<PendingRequest, { kind: 'approval' }> }) {
  const m = useT()
  const p = request.params
  const call = useMemo(() => approvalCallOf(p), [p])
  const { approval } = viewOf(call)
  const exec = p.preparedExecution
  const outside = !!exec?.escalated
  const decisions = order.filter((d) => p.availableDecisions.includes(d) && !(outside && d === 'acceptForSession'))
  const thread = useTimeline(p.threadId)?.thread
  const workspace = useWorkspace(thread?.workspaceId)
  const rules = p.suggestedRules ?? []
  const label = (d: Decision) =>
    d === 'acceptAlways' ? alwaysLabel(m, thread, workspace?.name) : d === 'accept' && outside ? m.requests.approval.runOutside : m.requests.approval.decisions[d]
  const variant = (d: Decision): ButtonProps['variant'] =>
    d === 'accept' ? (outside ? 'danger' : 'primary') : d === 'decline' && !outside ? 'ghost' : 'secondary'
  return (
    <ActionCard
      tone={outside ? 'danger' : 'warning'}
      icon={<ShieldAlert size={16} />}
      title={approval.title(m, call, p)}
      actions={decisions.map((d) => (
        <Button key={d} size="sm" variant={variant(d)} onClick={() => request.respond(d)}>
          {label(d)}
        </Button>
      ))}
    >
      {outside && <p className="text-ui text-fg">{m.requests.approval.outsideConsequence}</p>}
      {p.reason && <p className="selectable text-ui text-fg-muted">{p.reason}</p>}
      {/* What the call does, in its tool's words; a command's view already shows the command. */}
      {p.content && call.kind !== 'command' && <p className="selectable text-ui text-fg">{p.content}</p>}
      <approval.Body call={call} params={p} />
      {exec?.justification && <p className="selectable text-ui text-fg-muted">“{exec.justification}”</p>}
      {decisions.includes('acceptAlways') && rules.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-small text-fg-muted">
          <span className="mr-1">{m.requests.approval.alwaysAdds}</span>
          {rules.map((r) => (
            <code key={r} className="selectable rounded-sm bg-hover px-1.5 py-0.5 font-mono text-small">
              {r}
            </code>
          ))}
        </p>
      )}
    </ActionCard>
  )
}

/** Where ollupi saves the rules (agent.allowAlways): the thread's
 * workspace, which a subagent shares with its parent; without one, the
 * thread's own settings, a subagent's being its parent's. */
function alwaysLabel(m: Messages, thread: ThreadRow | undefined, workspace: string | undefined): string {
  const t = m.requests.approval
  if (workspace) return t.alwaysIn(workspace)
  return thread?.parentThreadId ? t.alwaysInParent : t.alwaysInThread
}
