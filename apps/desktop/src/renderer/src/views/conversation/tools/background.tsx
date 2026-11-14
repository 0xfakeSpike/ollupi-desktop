// A background call's result, come back to its conversation as an item of
// its own (backgroundResult). The call that started it returned at once;
// this is how it ended: its status in the text, and its tool's output.

import { formatValue } from '@ollupi/core'
import { isToolPart, type ItemRow } from '@ollupi/protocol'
import { ProcessRow } from '@ollupi/ui'
import { Hourglass } from 'lucide-react'
import { useT } from '../../../i18n'
import { CodeBlock } from '../../common/Markdown'
import { ErrorText } from './CallRow'
import { CommandOutputView } from './command'

export function BackgroundResult({ item }: { item: ItemRow }) {
  const m = useT()
  const failed = item.status === 'failed'
  const output = item.result?.output
  const command = item.tool === 'run_command' && isToolPart('run_command', 'output', output) ? output : undefined
  const shown = command ? '' : formatValue(output)
  return (
    <ProcessRow
      icon={<Hourglass size={14} className={failed ? 'text-danger' : undefined} />}
      title={m.conversation.items.backgroundEnded(item.tool ?? m.common.tool.unnamed)}
      meta={failed && <span className="text-danger">{m.conversation.items.backgroundStatus[item.text ?? ''] ?? item.text}</span>}
    >
      {command && <CommandOutputView output={command} />}
      {shown && <CodeBlock code={shown} label={m.conversation.tool.result} />}
      {item.error && <ErrorText text={item.error} />}
    </ProcessRow>
  )
}
