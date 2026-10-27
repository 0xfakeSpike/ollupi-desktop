import type { ItemRow, MemoryReference, MemoryScope } from '@ollupi/protocol'
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

/** The memory snapshot the conversation works with from here until its
 * next compaction: the global memories and its own scope's. */
export function MemoryContext({ item }: { item: ItemRow }) {
  const memories = item.memory ?? []
  if (memories.length === 0) return null
  return (
    <Disclosure
      summary={
        <span className="flex items-center gap-1.5 text-[13px]">
          <Brain size={13} /> Loaded {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        </span>
      }
    >
      <div className="flex flex-col gap-3 border-l-2 border-line pl-3">
        <MemoryGroups memories={memories} />
      </div>
    </Disclosure>
  )
}

/** How a conversation names a scope of its memories: global, and its own,
 * which is its workspace or general without one. */
export const scopeTitle: Record<MemoryScope, string> = {
  global: 'Global',
  general: 'Outside workspaces',
  workspace: 'This workspace',
}

/** Memories a conversation sees, by the scope each carries. */
export function MemoryGroups({ memories }: { memories: MemoryReference[] }) {
  return (Object.keys(scopeTitle) as MemoryScope[]).map((scope) => {
    const inScope = memories.filter((m) => m.scope === scope)
    return inScope.length > 0 && <MemoryGroup key={scope} title={scopeTitle[scope]} memories={inScope} />
  })
}

function MemoryGroup({ title, memories }: { title: string; memories: MemoryReference[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] text-fg-subtle">{title}</div>
      <ul className="selectable flex flex-col gap-1.5 text-[13px] text-fg-muted">
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
  return <div className="pl-6 font-mono text-[11px] text-fg-subtle">{item.text}</div>
}

export function ErrorItem({ item }: { item: ItemRow }) {
  return (
    <Callout tone="danger" icon={<TriangleAlert size={14} />}>
      <span className="selectable whitespace-pre-wrap">{item.error || item.text}</span>
    </Callout>
  )
}
