import type { ItemRow } from '@ollupi/protocol'
import { Callout, Disclosure } from '@ollupi/ui'
import { Brain, TriangleAlert } from 'lucide-react'

export function CompactionMarker() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
      <div className="h-px flex-1 bg-line" />
      Earlier context was summarized
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

/** The memories recall put into this step's prompt. */
export function MemoryContext({ item }: { item: ItemRow }) {
  const memories = item.memory ?? []
  if (memories.length === 0) return null
  return (
    <Disclosure
      summary={
        <span className="flex items-center gap-1.5 text-[13px]">
          <Brain size={13} /> Recalled {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        </span>
      }
    >
      <ul className="selectable flex flex-col gap-1.5 border-l-2 border-line pl-3 text-[13px] text-fg-muted">
        {memories.map((m) => (
          <li key={m.id}>
            {m.topic && <span className="font-medium text-fg">{m.topic}: </span>}
            {m.text}
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

export function ToolProgress({ item }: { item: ItemRow }) {
  if (!item.text) return null
  return <div className="pl-6 font-mono text-[11px] text-fg-subtle">{item.text}</div>
}

export function ErrorItem({ item }: { item: ItemRow }) {
  return (
    <Callout tone="danger" icon={<TriangleAlert size={14} />}>
      <span className="selectable whitespace-pre-wrap">{item.error || item.text}</span>
    </Callout>
  )
}
