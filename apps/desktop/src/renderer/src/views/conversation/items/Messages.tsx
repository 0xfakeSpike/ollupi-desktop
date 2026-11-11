import type { ItemRow } from '@ollupi/protocol'
import { cn, ProcessRow } from '@ollupi/ui'
import { Lightbulb } from 'lucide-react'
import { useT } from '../../../i18n'
import { duration } from '../../../i18n/format'
import { CopyButton, Markdown } from '../../common/Markdown'
import { Attachments } from './Attachments'

export function UserMessage({ item }: { item: ItemRow }) {
  const m = useT()
  return (
    <div className="flex flex-col items-end gap-2">
      <Attachments attachments={item.attachments} />
      {item.text && (
        // Copying sits beside the bubble's foot, shown while the message is pointed at or focused.
        <div className="group flex max-w-full items-end gap-1">
          <span className="opacity-0 transition-opacity duration-100 ease-standard group-focus-within:opacity-100 group-hover:opacity-100">
            <CopyButton text={item.text} label={m.conversation.timeline.copyMessage} />
          </span>
          <div className="selectable max-w-140 min-w-0 rounded-xl bg-surface px-3.5 py-2.5 text-body break-words whitespace-pre-wrap text-fg">{item.text}</div>
        </div>
      )}
    </div>
  )
}

/** quiet: the text of a response that went on to call tools, which says
 * what the agent is about to do; it reads as part of the process. */
export function AgentMessage({ item, quiet }: { item: ItemRow; quiet?: boolean }) {
  const streaming = item.status === 'inProgress'
  if (!item.text && !streaming) return null
  return (
    <div className={cn(quiet ? 'markdown-quiet text-fg-muted' : 'text-fg', streaming && 'streaming-caret')}>
      <Markdown text={item.text ?? ''} streaming={streaming} />
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
