// Asks to allow one tool call. For a command it shows the frozen execution:
// approving runs exactly that program, arguments and directory.

import { commandLine } from '@ollupi/core'
import { BuiltinTool, type Decision } from '@ollupi/protocol'
import { Badge, Button } from '@ollupi/ui'
import { ShieldAlert } from 'lucide-react'
import type { PendingRequest } from '../../domains/requests'
import { CodeBlock } from '../common/Markdown'

const decisionLabel: Record<Decision, string> = {
  decline: 'Decline',
  // A session grant in ollupi lasts for the thread: the same call is not asked again.
  acceptForSession: 'Allow for this thread',
  accept: 'Allow once',
}

// Decline first, the primary action last.
const order: Decision[] = ['decline', 'acceptForSession', 'accept']

export function ApprovalCard({ request }: { request: Extract<PendingRequest, { kind: 'approval' }> }) {
  const p = request.params
  const exec = p.preparedExecution
  const command = p.tool === BuiltinTool.Shell && exec?.program ? exec : undefined
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">
        <ShieldAlert size={15} className="text-warning" />
        {command ? 'Allow this command?' : `Allow ${p.tool}?`}
        {exec?.escalated && <Badge tone="warning">runs outside the sandbox</Badge>}
      </div>
      {p.reason && <p className="text-[13px] text-fg-muted">{p.reason}</p>}
      {command ? (
        <CodeBlock code={commandLine({ program: command.program!, args: command.args ?? [] })} label={`sh · ${command.cwd}`} />
      ) : (
        <CodeBlock code={JSON.stringify(p.arguments, null, 2)} label={p.server ? `${p.server} · arguments` : 'arguments'} />
      )}
      {exec?.justification && <p className="text-[13px] text-fg-muted">“{exec.justification}”</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {order
          .filter((d) => p.availableDecisions.includes(d))
          .map((d) => (
            <Button key={d} size="sm" variant={d === 'accept' ? 'primary' : 'secondary'} onClick={() => request.respond(d)}>
              {decisionLabel[d]}
            </Button>
          ))}
      </div>
    </div>
  )
}
