// Asks the user to allow one tool call. For commands it shows the frozen
// execution (program, args, directory) the server will run if approved.

import { BuiltinTool, commandLine } from '@ollupi/core'
import type { Decision } from '@ollupi/protocol'
import { Badge, Button } from '@ollupi/ui'
import { ShieldAlert } from 'lucide-react'
import { CodeBlock } from '../../components/Markdown'
import { respondApproval } from '../../services/actions/threads'
import type { PendingRequest } from '../../stores/requests'

type ApprovalRequest = Extract<PendingRequest, { kind: 'approval' }>

export function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const p = request.params
  const exec = p.preparedExecution
  const isCommand = p.tool === BuiltinTool.Shell && !!exec?.program
  const decide = (d: Decision) => respondApproval(p.itemId, d)
  const can = (d: Decision) => p.availableDecisions.includes(d)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <ShieldAlert size={15} className="text-warning" />
        {isCommand ? 'Allow this command?' : `Allow ${p.server && p.server !== 'builtin' ? `${p.server} · ` : ''}${p.tool}?`}
        {exec?.escalated && <Badge tone="warning">runs outside the sandbox</Badge>}
      </div>
      {p.reason && <p className="text-[13px] text-fg-muted">{p.reason}</p>}
      {isCommand ? (
        <CodeBlock code={commandLine({ program: exec!.program!, args: exec!.args ?? [] })} language={`sh · ${exec!.cwd}`} />
      ) : (
        <CodeBlock code={JSON.stringify(p.arguments, null, 2)} language="arguments" />
      )}
      {exec?.justification && <p className="text-[13px] text-fg-muted">“{exec.justification}”</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {can('decline') && (
          <Button size="sm" onClick={() => decide('decline')}>
            Decline
          </Button>
        )}
        {can('acceptForSession') && (
          <Button size="sm" onClick={() => decide('acceptForSession')}>
            Allow for this thread
          </Button>
        )}
        {can('accept') && (
          <Button size="sm" variant="primary" onClick={() => decide('accept')}>
            Allow once
          </Button>
        )}
      </div>
    </div>
  )
}
