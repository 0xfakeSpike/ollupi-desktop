// Picks the renderer for an item by its type; one case per ItemType.

import type { ItemRow } from '@ollupi/protocol'
import { memo } from 'react'
import { AgentMessage, Reasoning, UserMessage } from './Messages'
import { CompactionMarker, ErrorItem, MemoryContext, ToolProgress } from './SystemItems'
import { ToolCallView } from './ToolCallView'

export const ItemView = memo(function ItemView({ item }: { item: ItemRow }) {
  switch (item.type) {
    case 'userMessage':
      return <UserMessage item={item} />
    case 'agentMessage':
      return <AgentMessage item={item} />
    case 'reasoning':
      return <Reasoning item={item} />
    case 'toolCall':
      return <ToolCallView item={item} />
    case 'contextCompaction':
      return <CompactionMarker />
    case 'memoryContext':
      return <MemoryContext item={item} />
    case 'toolProgress':
      return <ToolProgress item={item} />
    case 'error':
      return <ErrorItem item={item} />
  }
})
