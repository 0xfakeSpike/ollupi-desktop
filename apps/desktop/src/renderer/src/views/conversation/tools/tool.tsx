// Any other tool, MCP or a provider's: its arguments and result as they
// are.

import type { ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Wrench } from 'lucide-react'
import { useT } from '../../../i18n'
import { ArgumentsAndResult, argumentsApproval, CallRow, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Tool = Extract<ToolCall, { kind: 'tool' }>

export const tool: ToolView<Tool> = {
  title: (m, call) => call.name ?? m.common.tool.unnamed,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: ToolCall,
  approval: argumentsApproval,
}

function ToolCall({ item, call }: { item: ItemRow; call: Tool }) {
  const m = useT()
  return (
    <CallRow item={item} icon={Wrench} title={tool.title(m, call)} failure={tool.failure(m, call, item)}>
      <ArgumentsAndResult item={item} />
    </CallRow>
  )
}
