// Picks the renderer for an item by its type; one case per ItemType.

import type { ItemRow } from '@ollupi/protocol'
import { memo } from 'react'
import { AgentMessage, Reasoning, UserMessage } from './Messages'
import { CompactionMarker, ErrorItem, MemoryContext } from './SystemItems'
import { ToolCallView } from '../tools'

/** editable: the thread's latest message, which can be taken back to edit. */
export const ItemView = memo(function ItemView({ item, editable }: { item: ItemRow; editable?: boolean }) {
  switch (item.type) {
    case 'userMessage':
      return <UserMessage item={item} editable={editable} />
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
    case 'error':
      return <ErrorItem item={item} />
  }
})
