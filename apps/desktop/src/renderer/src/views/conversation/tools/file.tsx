// edit_file and write_file: the file and the diff that was frozen for
// approval, which is exactly what is written.

import { createsFile, type ToolCall } from '@ollupi/core'
import type { FileChange, ItemRow } from '@ollupi/protocol'
import { FilePen, FilePlus } from 'lucide-react'
import { useT } from '../../../i18n'
import { CodeBlock } from '../../common/Markdown'
import { CallRow, ErrorText, statusFailure } from './CallRow'
import type { ToolView } from './types'

type File = Extract<ToolCall, { kind: 'file' }>

export const file: ToolView<File> = {
  title: (m, call) => (createsFile(call.change) ? m.conversation.tool.createFile(call.change.path) : m.conversation.tool.editFile(call.change.path)),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: FileCall,
  approval: {
    title: (m, call) => (createsFile(call.change) ? m.requests.approval.createFile : m.requests.approval.editFile),
    Body: ({ call }) => <FileDiff change={call.change} />,
    showsContent: true,
  },
}

function FileCall({ item, call }: { item: ItemRow; call: File }) {
  const m = useT()
  const Icon = createsFile(call.change) ? FilePlus : FilePen
  return (
    <CallRow item={item} icon={Icon} title={<span className="font-mono text-small">{file.title(m, call)}</span>} badge={<LineCounts change={call.change} />} failure={file.failure(m, call, item)}>
      <FileDiff change={call.change} />
      {item.error && <ErrorText text={item.error} />}
    </CallRow>
  )
}

function FileDiff({ change }: { change: FileChange }) {
  return <CodeBlock code={change.diff} label="diff" />
}

function LineCounts({ change }: { change: FileChange }) {
  if (change.added + change.removed === 0) return null
  return (
    <span className="font-mono text-small tabular-nums">
      {change.added > 0 && <span className="text-success">+{change.added}</span>}
      {change.removed > 0 && <span className="ml-1 text-danger">−{change.removed}</span>}
    </span>
  )
}
