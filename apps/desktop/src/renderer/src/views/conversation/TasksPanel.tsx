// The thread's plan beside the conversation, where it stays in view while
// the timeline scrolls: the steps of the last update_plan call that went
// through, and how many are done.

import { currentPlan, type Timeline } from '@ollupi/core'
import { useLocale, useT } from '../../i18n'
import { relativeTime } from '../../i18n/format'
import { PlanSteps } from './PlanSteps'
import { SidePanel } from './SidePanel'

export function TasksPanel({ timeline }: { timeline: Timeline | undefined }) {
  const m = useT()
  const t = m.conversation.tasks
  const locale = useLocale((s) => s.locale)
  const current = timeline && currentPlan(timeline)
  const steps = current?.plan.plan ?? []
  const at = current && (current.item.completedAt ?? current.item.startedAt)

  return (
    <SidePanel panel="tasks" title={t.title} closeLabel={t.close}>
      {!current ? (
        // A plan may sit in messages not loaded yet.
        <p className="text-small text-fg-subtle">{timeline?.hasMore ? t.emptyLoaded : t.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-small text-fg-muted">
            <span className="tabular-nums">{t.done(steps.filter((s) => s.status === 'completed').length, steps.length)}</span>
            {at && <span title={new Date(at).toLocaleString(locale)}>{t.updated(relativeTime(m, locale, at))}</span>}
          </div>
          <PlanSteps plan={current.plan} />
        </div>
      )}
    </SidePanel>
  )
}
