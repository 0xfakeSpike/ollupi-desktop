// Asks to allow one tool call, which the view of its kind words and shows
// (a command its frozen execution). A call that leaves the sandbox is the
// dangerous tier: it says what that means, its primary action says so too,
// and it can only be allowed once.

import { approvalCallOf } from '@ollupi/core'
import type { Decision } from '@ollupi/protocol'
import { ActionCard, Button, type ButtonProps } from '@ollupi/ui'
import { ShieldAlert } from 'lucide-react'
import { useMemo } from 'react'
import type { PendingRequest } from '../../domains/requests'
import { useT } from '../../i18n'
import { viewOf } from '../conversation/tools'

// Decline first, the primary action last.
const order: Decision[] = ['decline', 'acceptForSession', 'accept']

export function ApprovalCard({ request }: { request: Extract<PendingRequest, { kind: 'approval' }> }) {
  const m = useT()
  const p = request.params
  const call = useMemo(() => approvalCallOf(p), [p])
  const { approval } = viewOf(call)
  const exec = p.preparedExecution
  const outside = !!exec?.escalated
  const decisions = order.filter((d) => p.availableDecisions.includes(d) && !(outside && d === 'acceptForSession'))
  const variant = (d: Decision): ButtonProps['variant'] =>
    d === 'accept' ? (outside ? 'danger' : 'primary') : d === 'decline' && !outside ? 'ghost' : 'secondary'
  return (
    <ActionCard
      tone={outside ? 'danger' : 'warning'}
      icon={<ShieldAlert size={16} />}
      title={approval.title(m, call, p)}
      actions={decisions.map((d) => (
        <Button key={d} size="sm" variant={variant(d)} onClick={() => request.respond(d)}>
          {d === 'accept' && outside ? m.requests.approval.runOutside : m.requests.approval.decisions[d]}
        </Button>
      ))}
    >
      {outside && <p className="text-ui text-fg">{m.requests.approval.outsideConsequence}</p>}
      {p.reason && <p className="selectable text-ui text-fg-muted">{p.reason}</p>}
      <approval.Body call={call} params={p} />
      {exec?.justification && <p className="selectable text-ui text-fg-muted">“{exec.justification}”</p>}
    </ActionCard>
  )
}
