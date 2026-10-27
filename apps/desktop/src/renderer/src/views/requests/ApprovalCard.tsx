// Asks to allow one tool call. For a command it shows the frozen execution:
// approving runs exactly that program, arguments and directory. A call
// that leaves the sandbox is the dangerous tier: it says what that means,
// its primary action says so too, and it can only be allowed once.

import { commandLine } from '@ollupi/core'
import type { BuiltinToolName, Decision } from '@ollupi/protocol'
import { ActionCard, Button, type ButtonProps } from '@ollupi/ui'
import { ShieldAlert } from 'lucide-react'
import type { PendingRequest } from '../../domains/requests'
import { useT } from '../../i18n'
import { CodeBlock } from '../common/Markdown'

const SHELL: BuiltinToolName = 'run_command'

// Decline first, the primary action last.
const order: Decision[] = ['decline', 'acceptForSession', 'accept']

export function ApprovalCard({ request }: { request: Extract<PendingRequest, { kind: 'approval' }> }) {
  const m = useT()
  const p = request.params
  const exec = p.preparedExecution
  const command = p.tool === SHELL && exec?.program ? exec : undefined
  const outside = !!exec?.escalated
  const decisions = order.filter((d) => p.availableDecisions.includes(d) && !(outside && d === 'acceptForSession'))
  const variant = (d: Decision): ButtonProps['variant'] =>
    d === 'accept' ? (outside ? 'danger' : 'primary') : d === 'decline' && !outside ? 'ghost' : 'secondary'
  return (
    <ActionCard
      tone={outside ? 'danger' : 'warning'}
      icon={<ShieldAlert size={16} />}
      title={command ? (outside ? m.requests.approval.commandOutside : m.requests.approval.command) : m.requests.approval.tool(p.tool)}
      actions={decisions.map((d) => (
        <Button key={d} size="sm" variant={variant(d)} onClick={() => request.respond(d)}>
          {d === 'accept' && outside ? m.requests.approval.runOutside : m.requests.approval.decisions[d]}
        </Button>
      ))}
    >
      {outside && <p className="text-ui text-fg">{m.requests.approval.outsideConsequence}</p>}
      {p.reason && <p className="selectable text-ui text-fg-muted">{p.reason}</p>}
      {command ? (
        <CodeBlock code={commandLine(command)} label={`sh · ${command.cwd}`} />
      ) : (
        <CodeBlock code={JSON.stringify(p.arguments, null, 2)} label={p.server ? m.requests.approval.serverArguments(p.server) : m.requests.approval.arguments} />
      )}
      {exec?.justification && <p className="selectable text-ui text-fg-muted">“{exec.justification}”</p>}
    </ActionCard>
  )
}
