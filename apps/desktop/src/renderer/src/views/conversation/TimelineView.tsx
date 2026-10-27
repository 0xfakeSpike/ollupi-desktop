// A timeline as turns: what started each turn, its items, and how it ended.
// Items are drawn by ItemView.

import {
  activeTurn,
  groupByTurn,
  needsUser,
  queuedTurns,
  waitingOnUser,
  type Timeline,
  type TurnGroup,
} from '@ollupi/core'
import type { ItemRow, TurnRow } from '@ollupi/protocol'
import { Button, Callout } from '@ollupi/ui'
import { CalendarClock, Clock, OctagonX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadOlder } from '../../domains/conversation'
import { loadJobs, useThreadJobs } from '../../domains/cron'
import { useThreadSummary } from '../../domains/threads'
import { useT } from '../../i18n'
import { duration, usageLine } from '../../i18n/format'
import { ItemView } from './items/ItemView'

export function TimelineView({ timeline }: { timeline: Timeline }) {
  const threadId = timeline.thread.id
  const groups = useMemo(() => groupByTurn(timeline), [timeline])
  const queued = queuedTurns(timeline)
  const summary = useThreadSummary(threadId)
  const running = activeTurn(timeline)
  // Working: the turn runs and nobody is asked anything, here or (as the
  // thread's status reports) in one of its subagents.
  const working = !!running && !waitingOnUser(timeline) && !needsUser(summary?.status)
  const jobNames = useJobNames(threadId, timeline)
  const m = useT()

  return (
    <div className="mx-auto flex w-full max-w-thread flex-col gap-6 px-6 pt-6 pb-10">
      {timeline.hasMore && <LoadOlder threadId={threadId} />}
      {groups.length === 0 && queued.length === 0 && <div className="py-16 text-center text-ui text-fg-subtle">{m.conversation.timeline.empty}</div>}
      {groups.map((g) => (
        <TurnSection key={g.turn.id} group={g} working={working && g.turn.id === running?.id} jobName={jobNames(g.turn)} />
      ))}
      {queued.map((t) => (
        <QueuedTurn key={t.id} turn={t} jobName={jobNames(t)} />
      ))}
    </div>
  )
}

/** Names of the scheduled tasks that started turns. The turn stores only
 * the task's id, so the thread's tasks are loaded when a turn has one. */
function useJobNames(threadId: string, timeline: Timeline): (turn: TurnRow) => string | undefined {
  const jobs = useThreadJobs(threadId)
  const scheduled = timeline.turns.some((t) => t.cronJobId)
  const someJob = useT().conversation.timeline.someJob
  useEffect(() => {
    if (scheduled && !jobs) void loadJobs(threadId)
  }, [scheduled, jobs, threadId])
  return (turn) => (turn.cronJobId ? (jobs?.find((j) => j.id === turn.cronJobId)?.name ?? someJob) : undefined)
}

function LoadOlder({ threadId }: { threadId: string }) {
  const [loading, setLoading] = useState(false)
  const m = useT()
  return (
    <div className="flex justify-center">
      <Button
        size="sm"
        variant="ghost"
        loading={loading}
        onClick={() => {
          setLoading(true)
          void loadOlder(threadId).finally(() => setLoading(false))
        }}
      >
        {m.conversation.timeline.loadOlder}
      </Button>
    </div>
  )
}

function TurnSection({ group, working, jobName }: { group: TurnGroup; working: boolean; jobName: string | undefined }) {
  const { turn, items } = group
  const m = useT()
  return (
    <section className="flex flex-col gap-3">
      {jobName && <ScheduledBy name={jobName} />}
      {items.map((item) => (
        <ItemView key={item.id} item={item} />
      ))}
      {working && !streaming(items.at(-1)) && <div className="shimmer w-fit text-ui">{m.conversation.timeline.working}</div>}
      <TurnOutcome turn={turn} />
    </section>
  )
}

function ScheduledBy({ name }: { name: string }) {
  const m = useT()
  return (
    <div className="flex items-center justify-end gap-1.5 text-small text-fg-subtle">
      <CalendarClock size={14} /> {m.conversation.timeline.sentBy(name)}
    </div>
  )
}

function streaming(item: ItemRow | undefined): boolean {
  return !!item && item.status === 'inProgress' && (item.type === 'agentMessage' || item.type === 'reasoning')
}

function TurnOutcome({ turn }: { turn: TurnRow }) {
  const m = useT()
  switch (turn.status) {
    case 'failed':
      return (
        <Callout tone="danger">
          <span className="selectable">{turn.error || m.conversation.timeline.failed}</span>
        </Callout>
      )
    case 'interrupted':
      return (
        <div className="flex items-center gap-1.5 text-small text-fg-subtle">
          <OctagonX size={14} /> {m.conversation.timeline.stopped(turn.error)}
        </div>
      )
    case 'completed': {
      const usage = usageLine(m, turn.usage)
      const facts = [turn.model.connection, turn.completedAt && duration(m, turn.startedAt, turn.completedAt), usage].filter(Boolean)
      return <div className="text-small text-fg-subtle tabular-nums">{facts.join(' · ')}</div>
    }
    case 'queued':
    case 'inProgress':
      return null
  }
}

/** A queued turn's input is on the turn row until it starts. */
function QueuedTurn({ turn, jobName }: { turn: TurnRow; jobName: string | undefined }) {
  const m = useT()
  return (
    <div className="flex flex-col items-end gap-1">
      {jobName && <ScheduledBy name={jobName} />}
      <div className="max-w-4/5 rounded-2xl border border-dashed border-line-strong px-4 py-2 text-body break-words whitespace-pre-wrap text-fg-muted">{turn.input}</div>
      <span className="flex items-center gap-1 text-small text-fg-subtle">
        <Clock size={14} /> {m.conversation.timeline.queued}
      </span>
    </div>
  )
}
