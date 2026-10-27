// Asks to allow one tool call. For a command it shows the frozen execution:
// approving runs exactly that program, arguments and directory.

import { commandLine } from '@ollupi/core'
import type { BuiltinToolName, Decision } from '@ollupi/protocol'
import { Badge, Button } from '@ollupi/ui'
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
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">
        <ShieldAlert size={15} className="text-warning" />
        {command ? m.requests.approval.command : m.requests.approval.tool(p.tool)}
        {exec?.escalated && <Badge tone="warning">{m.requests.approval.outsideSandbox}</Badge>}
      </div>
      {p.reason && <p className="text-[13px] text-fg-muted">{p.reason}</p>}
      {command ? (
        <CodeBlock code={commandLine(command)} label={`sh · ${command.cwd}`} />
      ) : (
        <CodeBlock code={JSON.stringify(p.arguments, null, 2)} label={p.server ? m.requests.approval.serverArguments(p.server) : m.requests.approval.arguments} />
      )}
      {exec?.justification && <p className="text-[13px] text-fg-muted">“{exec.justification}”</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {order
          .filter((d) => p.availableDecisions.includes(d))
          .map((d) => (
            <Button key={d} size="sm" variant={d === 'accept' ? 'primary' : 'secondary'} onClick={() => request.respond(d)}>
              {m.requests.approval.decisions[d]}
            </Button>
          ))}
      </div>
    </div>
  )
}
