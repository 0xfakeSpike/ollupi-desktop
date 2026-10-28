// update_plan: the steps and how many are done, as a block of its own.

import type { ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Block, cn } from '@ollupi/ui'
import { Circle, CircleCheck, CircleDot, ListChecks } from 'lucide-react'
import { useT } from '../../../i18n'
import { argumentsApproval, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Plan = Extract<ToolCall, { kind: 'plan' }>

export const plan: ToolView<Plan> = {
  title: (m) => m.common.tool.plan,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: PlanCall,
  approval: argumentsApproval,
}

// Steps differ by shape and weight, not colour.
const steps = {
  pending: { icon: <Circle size={14} className="text-fg-subtle" />, text: 'text-fg' },
  in_progress: { icon: <CircleDot size={14} className="text-fg" />, text: 'text-fg' },
  completed: { icon: <CircleCheck size={14} className="text-fg-subtle" />, text: 'text-fg-subtle' },
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
      {call.plan.explanation && <p className="selectable text-ui text-fg-muted">{call.plan.explanation}</p>}
      <ol className="flex flex-col gap-1">
        {list.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-ui">
            <span className="mt-0.75 flex shrink-0">{steps[s.status].icon}</span>
            <span className={cn('selectable', steps[s.status].text)}>{s.step}</span>
          </li>
        ))}
      </ol>
    </Block>
  )
}
