// A run of read_file, glob and grep calls (core's groupReads) as one line
// that says what they did, opening into each call.

import type { ItemGroup, ToolCall } from '@ollupi/core'
import { cn, ProcessRow, Spinner } from '@ollupi/ui'
import { FileSearch } from 'lucide-react'
import { useT } from '../../../i18n'
import { ToolCallView } from './index'

export function ReadsRow({ group }: { group: Extract<ItemGroup, { kind: 'reads' }> }) {
  const m = useT()
  const count = (kind: ToolCall['kind']) => group.calls.filter((c) => c.kind === kind).length
  const running = group.items.some((i) => i.status === 'pending' || i.status === 'inProgress')
  const failed = group.items.some((i) => i.status === 'failed')
  return (
    <ProcessRow
      icon={<FileSearch size={14} className={cn(failed && 'text-danger')} />}
      title={m.conversation.tool.reads(count('read'), count('glob'), count('grep'))}
      meta={running ? <Spinner size={14} /> : failed && <span className="text-danger">{m.conversation.tool.failed}</span>}
    >
      <div className="flex flex-col gap-1">
        {group.items.map((item) => (
          <ToolCallView key={item.id} item={item} />
        ))}
      </div>
    </ProcessRow>
  )
}
