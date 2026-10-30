// run_command: the frozen command, what it printed and how it exited.

import { commandFailed, commandLine, type ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Badge, Block, cn } from '@ollupi/ui'
import { Terminal } from 'lucide-react'
import { useT } from '../../../i18n'
import { CodeBlock } from '../../common/Markdown'
import { CallRow, ErrorText } from './CallRow'
import type { ToolView } from './types'

type Command = Extract<ToolCall, { kind: 'command' }>

export const command: ToolView<Command> = {
  title: (_m, call) => commandLine(call.command),
  failure(m, { output }, item) {
    // A command that exits non-zero or is killed failed, though the call
    // itself completed.
    if (item.status === 'failed') return output ? m.conversation.tool.exit(output.exit_code) : m.conversation.tool.failed
    if (item.status === 'completed' && output && commandFailed(output)) return output.signal ?? m.conversation.tool.exit(output.exit_code)
    return undefined
  },
  Call: CommandCall,
  approval: {
    title: (m, call) => (call.command.escalated ? m.requests.approval.commandOutside : m.requests.approval.command),
    // Approving runs exactly this program, arguments and directory.
    Body: ({ call }) => <CodeBlock code={commandLine(call.command)} label={`sh · ${call.command.cwd}`} />,
    showsContent: true,
  },
}

function CommandCall({ item, call }: { item: ItemRow; call: Command }) {
  const m = useT()
  return (
    <CallRow
      item={item}
      icon={Terminal}
      title={<span className="font-mono text-small">{command.title(m, call)}</span>}
      badge={call.command.escalated && <Badge tone="warning">{m.conversation.tool.outsideSandbox}</Badge>}
      failure={command.failure(m, call, item)}
    >
      <CommandDetails item={item} call={call} />
    </CallRow>
  )
}

function CommandDetails({ item, call: { command: cmd, output: out } }: { item: ItemRow; call: Command }) {
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
