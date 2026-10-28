// update_plan: the steps and how many are done, as a block of its own.

import type { ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Block } from '@ollupi/ui'
import { ListChecks } from 'lucide-react'
import { useT } from '../../../i18n'
import { PlanSteps } from '../PlanSteps'
import { argumentsApproval, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Plan = Extract<ToolCall, { kind: 'plan' }>

export const plan: ToolView<Plan> = {
  title: (m) => m.common.tool.plan,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: PlanCall,
  approval: argumentsApproval,
}

function PlanCall({ call }: { item: ItemRow; call: Plan }) {
  const m = useT()
  const list = call.plan.plan
  const done = list.filter((s) => s.status === 'completed').length
  return (
    <Block
      label={
        <span className="flex items-center gap-1.5">
          <ListChecks size={14} /> {m.conversation.tool.plan}
          <span className="tabular-nums">
            {done}/{list.length}
          </span>
        </span>
      }
    >
      <PlanSteps plan={call.plan} />
    </Block>
  )
}

