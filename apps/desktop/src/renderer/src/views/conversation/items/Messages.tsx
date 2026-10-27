import type { ItemRow } from '@ollupi/protocol'
import { cn, ProcessRow } from '@ollupi/ui'
import { Lightbulb } from 'lucide-react'
import { useT } from '../../../i18n'
import { duration } from '../../../i18n/format'
import { Markdown } from '../../common/Markdown'

export function UserMessage({ item }: { item: ItemRow }) {
  return (
    <div className="flex justify-end">
      <div className="selectable max-w-[80%] rounded-2xl bg-surface px-4 py-2 text-sm leading-6 break-words whitespace-pre-wrap text-fg">{item.text}</div>
    </div>
  )
}

export function AgentMessage({ item }: { item: ItemRow }) {
  const streaming = item.status === 'inProgress'
  if (!item.text && !streaming) return null
  return (
    <div className={streaming ? 'streaming-caret text-sm text-fg' : 'text-sm text-fg'}>
      <Markdown text={item.text ?? ''} />
    </div>
  )
}

export function Reasoning({ item }: { item: ItemRow }) {
  const thinking = item.status === 'inProgress'
  const m = useT()
  if (!thinking && !item.text) return null
  return (
    <ProcessRow
      icon={<Lightbulb size={14} />}
      title={
        <span className={cn(thinking && 'shimmer')}>
          {thinking ? m.conversation.items.thinking : m.conversation.items.thoughtFor(duration(m, item.startedAt, item.completedAt))}
        </span>
      }
    >
      {item.text && <div className="selectable text-ui whitespace-pre-wrap text-fg-muted">{item.text}</div>}
    </ProcessRow>
  )
}
