// A plan's explanation and steps, as update_plan sets them: in the
// timeline's plan block and in the tasks panel.

import type { Plan } from '@ollupi/protocol'
import { cn } from '@ollupi/ui'
import { Circle, CircleCheck, CircleDot } from 'lucide-react'

// Steps differ by shape and weight, not colour.
const steps = {
  pending: { icon: <Circle size={14} className="text-fg-subtle" />, text: 'text-fg' },
  in_progress: { icon: <CircleDot size={14} className="text-fg" />, text: 'text-fg' },
  completed: { icon: <CircleCheck size={14} className="text-fg-subtle" />, text: 'text-fg-subtle' },
}

export function PlanSteps({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.explanation && <p className="selectable text-ui text-fg-muted">{plan.explanation}</p>}
      <ol className="flex flex-col gap-1">
        {plan.plan.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-ui">
            <span className="mt-0.75 flex shrink-0">{steps[s.status].icon}</span>
            <span className={cn('selectable', steps[s.status].text)}>{s.step}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
