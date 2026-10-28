import type { ItemRow, MemoryReference, MemoryScope } from '@ollupi/protocol'
import { ProcessRow } from '@ollupi/ui'
import { Brain, CircleAlert } from 'lucide-react'
import { useT } from '../../../i18n'

export function CompactionMarker() {
  const m = useT()
  return (
    <div className="flex items-center gap-3 text-small text-fg-subtle">
      <div className="h-px flex-1 bg-line" />
      {m.conversation.items.compacted}
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

/** The memory snapshot the conversation works with from here until its
 * next compaction: the global memories and its own scope's. */
export function MemoryContext({ item }: { item: ItemRow }) {
  const memories = item.memory ?? []
  const m = useT()
  if (memories.length === 0) return null
  return (
    <ProcessRow quiet icon={<Brain size={14} />} title={m.conversation.items.memoryLoaded(memories.length)}>
      <MemoryGroups memories={memories} />
    </ProcessRow>
  )
}

/** The scopes in the order a conversation lists them (see the catalog's
 * memoryScope for their names). */
const scopes: MemoryScope[] = ['global', 'general', 'workspace']

/** Memories a conversation sees, by the scope each carries. */
function MemoryGroups({ memories }: { memories: MemoryReference[] }) {
  const m = useT()
  return (
    <div className="flex flex-col gap-3">
      {scopes.map((scope) => {
        const inScope = memories.filter((r) => r.scope === scope)
        return inScope.length > 0 && <MemoryGroup key={scope} title={m.conversation.memoryScope[scope]} memories={inScope} />
      })}
    </div>
  )
}

function MemoryGroup({ title, memories }: { title: string; memories: MemoryReference[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-small font-medium text-fg-subtle">{title}</div>
      <ul className="selectable flex flex-col gap-1 text-ui text-fg-muted">
        {memories.map((m) => (
          <li key={m.id}>
            {m.topic && <span className="font-medium text-fg">{m.topic}: </span>}
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ToolProgress({ item }: { item: ItemRow }) {
  if (!item.text) return null
  return <div className="truncate pl-5 font-mono text-small text-fg-subtle">{item.text}</div>
}

/** The first line says what failed; a longer message opens below it. */
export function ErrorItem({ item }: { item: ItemRow }) {
  const text = item.error || item.text || ''
  const [first, ...rest] = text.split('\n')
  return (
    <ProcessRow icon={<CircleAlert size={14} className="text-danger" />} title={<span className="selectable text-danger">{first}</span>}>
      {rest.length > 0 && <div className="selectable font-mono text-small break-words whitespace-pre-wrap text-fg-muted">{text}</div>}
    </ProcessRow>
  )
}
