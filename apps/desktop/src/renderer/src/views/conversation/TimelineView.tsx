// A timeline as turns: what started each turn, its items, and how it ended.
// Items are drawn by ItemView.

import {
  activeTurn,
  duration,
  groupByTurn,
  needsUser,
  queuedTurns,
  usageLine,
  waitingOnUser,
  type Timeline,
  type TurnGroup,
} from '@ollupi/core'
import type { ItemRow, TurnRow } from '@ollupi/protocol'
import { Button, Callout } from '@ollupi/ui'
import { CalendarClock, Clock, OctagonX, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadOlder } from '../../domains/conversation'
import { loadJobs, useThreadJobs } from '../../domains/cron'
import { useThreadSummary } from '../../domains/threads'
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-6 pb-10">
      {timeline.hasMore && <LoadOlder threadId={threadId} />}
      {groups.length === 0 && queued.length === 0 && <div className="py-16 text-center text-sm text-fg-subtle">No messages yet.</div>}
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
  useEffect(() => {
    if (scheduled && !jobs) void loadJobs(threadId)
  }, [scheduled, jobs, threadId])
  return (turn) => (turn.cronJobId ? (jobs?.find((j) => j.id === turn.cronJobId)?.name ?? 'a scheduled task') : undefined)
}

function LoadOlder({ threadId }: { threadId: string }) {
  const [loading, setLoading] = useState(false)
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
        Load earlier messages
      </Button>
    </div>
  )
}

function TurnSection({ group, working, jobName }: { group: TurnGroup; working: boolean; jobName: string | undefined }) {
  const { turn, items } = group
  return (
    <section className="flex flex-col gap-3">
      {jobName && <ScheduledBy name={jobName} />}
      {items.map((item) => (
        <ItemView key={item.id} item={item} />
      ))}
      {working && !streaming(items.at(-1)) && <div className="shimmer w-fit text-[13px]">Working…</div>}
      <TurnOutcome turn={turn} />
    </section>
  )
}

function ScheduledBy({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
      <CalendarClock size={12} /> Sent by {name}
    </div>
  )
}

function streaming(item: ItemRow | undefined): boolean {
  return !!item && item.status === 'inProgress' && (item.type === 'agentMessage' || item.type === 'reasoning')
}

function TurnOutcome({ turn }: { turn: TurnRow }) {
  switch (turn.status) {
    case 'failed':
      return (
        <Callout tone="danger" icon={<TriangleAlert size={14} />}>
          <span className="selectable">{turn.error || 'The turn failed.'}</span>
        </Callout>
      )
    case 'interrupted':
      return (
        <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <OctagonX size={12} /> Stopped{turn.error ? `: ${turn.error}` : ''}
        </div>
      )
    case 'completed': {
      const usage = usageLine(turn.usage)
      return (
        <div className="flex gap-2 text-[11px] text-fg-subtle">
          <span>{turn.model.connection}</span>
          {turn.completedAt && <span>· {duration(turn.startedAt, turn.completedAt)}</span>}
          {usage && <span>· {usage}</span>}
        </div>
      )
    }
    case 'queued':
    case 'inProgress':
      return null
  }
}

/** A queued turn's input is on the turn row until it starts. */
function QueuedTurn({ turn, jobName }: { turn: TurnRow; jobName: string | undefined }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {jobName && <ScheduledBy name={jobName} />}
      <div className="max-w-[80%] rounded-2xl border border-dashed border-line-strong px-4 py-2 text-sm whitespace-pre-wrap text-fg-muted">{turn.input}</div>
      <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
        <Clock size={11} /> Queued
      </span>
    </div>
  )
}
