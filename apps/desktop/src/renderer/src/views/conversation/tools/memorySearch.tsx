// memory_search: what was searched for, and the memories found by scope.

import type { ToolCall } from '@ollupi/core'
import type { ItemRow, MemoryReference } from '@ollupi/protocol'
import { Brain } from 'lucide-react'
import { useT } from '../../../i18n'
import { MemoryGroups } from '../items/SystemItems'
import { ArgumentsAndResult, argumentsApproval, CallRow, statusFailure } from './CallRow'
import type { ToolView } from './types'

type MemorySearch = Extract<ToolCall, { kind: 'memorySearch' }>

export const memorySearch: ToolView<MemorySearch> = {
  title: (m, { search }) => (search.query ? m.common.tool.memorySearchFor(search.query) : m.common.tool.memorySearch),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: MemorySearchCall,
  approval: argumentsApproval,
}

function MemorySearchCall({ item, call }: { item: ItemRow; call: MemorySearch }) {
  const m = useT()
  const { memories } = call.search
  return (
    <CallRow item={item} icon={Brain} title={memorySearch.title(m, call)} failure={memorySearch.failure(m, call, item)}>
      {memories ? <SearchResults memories={memories} /> : <ArgumentsAndResult item={item} />}
    </CallRow>
  )
}

function SearchResults({ memories }: { memories: MemoryReference[] }) {
  const m = useT()
  if (memories.length === 0) return <div className="text-small text-fg-subtle">{m.conversation.tool.noMemories}</div>
  return <MemoryGroups memories={memories} />
}
