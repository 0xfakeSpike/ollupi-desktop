import type { ItemRow } from '@ollupi/protocol'
import { cn, IconButton, ProcessRow } from '@ollupi/ui'
import { Lightbulb, Pencil } from 'lucide-react'
import { editMessage } from '../../../domains/conversation'
import { useOpenThreadId } from '../../../domains/navigation'
import { useT } from '../../../i18n'
import { duration } from '../../../i18n/format'
import { CopyButton, Markdown } from '../../common/Markdown'
import { Attachments } from './Attachments'

/** editable: the thread's latest message, which can be taken back to the
 * box to edit (editMessage). */
export function UserMessage({ item, editable }: { item: ItemRow; editable?: boolean }) {
  const m = useT()
  const threadId = useOpenThreadId()
  const edit = editable && threadId && (
    <IconButton label={m.conversation.timeline.editMessage} size="sm" onClick={() => void editMessage(threadId, item)}>
      <Pencil size={14} />
    </IconButton>
  )
  // The message's buttons sit beside the bubble's foot, or under the files
  // of a message that has no text, shown while it is pointed at or focused.
  const actions = (
    <span className="flex opacity-0 transition-opacity duration-100 ease-standard group-focus-within:opacity-100 group-hover:opacity-100">
      {edit}
      {item.text && <CopyButton text={item.text} label={m.conversation.timeline.copyMessage} />}
    </span>
  )
  return (
    <div className="group flex flex-col items-end gap-2">
      <Attachments attachments={item.attachments} />
      {item.text ? (
        <div className="flex max-w-full items-end gap-1">
          {actions}
          <div className="selectable max-w-140 min-w-0 rounded-xl bg-surface px-3.5 py-2.5 text-body break-words whitespace-pre-wrap text-fg">{item.text}</div>
        </div>
      ) : (
        edit && actions
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
