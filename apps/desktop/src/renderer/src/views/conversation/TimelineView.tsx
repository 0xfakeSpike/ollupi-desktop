// A timeline as turns: what started each turn, its items, and how it ended.
// Items are drawn by ItemView; a turn reads as core's layoutTurn: the
// person's words, the process (Process) and the answer.

import { groupByTurn, layoutTurn, queuedTurns, turnActive, type Timeline, type TurnGroup } from '@ollupi/core'
import type { TurnRow } from '@ollupi/protocol'
import { Button, Callout } from '@ollupi/ui'
import { CalendarClock, Clock, OctagonX } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadOlder } from '../../domains/conversation'
import { useCron } from '../../domains/cron'
import { focusItem, useNavigation } from '../../domains/navigation'
import { useT } from '../../i18n'
import { duration, usageLine } from '../../i18n/format'
import { markFound } from '../common/found'
import { CopyButton } from '../common/Markdown'
import { Attachments } from './items/Attachments'
import { ItemView } from './items/ItemView'
import { ThreadWorkspace } from '../common/FileLink'
import { Process } from './Process'

export function TimelineView({ timeline }: { timeline: Timeline }) {
  const threadId = timeline.thread.id
  const groups = useMemo(() => groupByTurn(timeline), [timeline])
  const queued = queuedTurns(timeline)
  // Only the latest message can be taken back to edit; a queued one is later.
  const latest = queued.length ? undefined : timeline.items.findLast((i) => i.type === 'userMessage')?.id
  const jobNames = useJobNames()
  const m = useT()
  useFocusedItem(timeline)

  return (
    <ThreadWorkspace.Provider value={timeline.thread.workspaceId || undefined}>
      <div className="mx-auto flex w-full max-w-thread flex-col gap-6 px-6 pt-8 pb-10">
        {timeline.hasMore && <LoadOlder threadId={threadId} />}
        {groups.length === 0 && queued.length === 0 && <div className="py-16 text-center text-ui text-fg-subtle">{m.conversation.timeline.empty}</div>}
        {groups.map((g) => (
          <TurnSection key={g.turn.id} group={g} jobName={jobNames(g.turn)} latest={latest} />
        ))}
        {queued.map((t) => (
          <QueuedTurn key={t.id} turn={t} jobName={jobNames(t)} />
        ))}
      </div>
    </ThreadWorkspace.Provider>
  )
}

/** Brings the item a search led to into view, once it is loaded, and marks
 * it for a moment. */
function useFocusedItem(timeline: Timeline): void {
  const focus = useNavigation((s) => s.focus)
  const threadId = timeline.thread.id
  const loaded = !!focus && focus.threadId === threadId && timeline.items.some((i) => i.id === focus.itemId)
  useEffect(() => {
    if (!loaded || !focus) return
    // After the frame that lays the item out.
    const frame = requestAnimationFrame(() => {
      focusItem(undefined)
      markFound(document.querySelector(`[data-item-id="${CSS.escape(focus.itemId)}"]`)?.firstElementChild)
    })
    return () => cancelAnimationFrame(frame)
  }, [loaded, focus])
}

/** Names of the scheduled tasks that started turns: the turn stores only
 * the task's id, and a deleted task has no name left. */
function useJobNames(): (turn: TurnRow) => string | undefined {
  const jobs = useCron((s) => s.jobs)
  const someJob = useT().conversation.timeline.someJob
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

function TurnSection({ group, jobName, latest }: { group: TurnGroup; jobName: string | undefined; latest: string | undefined }) {
  const { turn, items } = group
  const parts = useMemo(() => layoutTurn(items), [items])
  const ended = !turnActive(turn.status)
  const answered = parts.some((p) => p.kind === 'answer')
  // The answer once the turn is over, as written (Markdown), to copy.
  const answer = ended ? parts.flatMap((p) => (p.kind === 'answer' && p.item.text ? [p.item.text] : [])).join('\n\n') : ''
  const m = useT()
  return (
    <section className="flex flex-col gap-5">
      {jobName && <ScheduledBy name={jobName} />}
      {parts.map((p) =>
        p.kind === 'process' ? (
          <Process key={p.items[0]!.id} items={p.items} ended={ended} answered={answered} endedAt={turn.completedAt ?? undefined} />
        ) : (
          // Takes no box, so the section's gap stays; a search finds the item by it.
          <div key={p.item.id} data-item-id={p.item.id} className="contents">
            <ItemView item={p.item} editable={p.item.id === latest} />
          </div>
        ),
      )}
      <TurnOutcome turn={turn} copy={answer ? <CopyButton text={answer} label={m.conversation.timeline.copyAnswer} /> : null} />
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

/** How the turn ended, led by the copy button for its answer when it has one. */
function TurnOutcome({ turn, copy }: { turn: TurnRow; copy: ReactNode }) {
  const m = useT()
  // The 24px button keeps to the line's height and its icon to the column's edge.
  const lead = copy && <span className="-my-1 -ml-1.5 flex">{copy}</span>
  switch (turn.status) {
    case 'failed':
      return (
        <>
          {lead && <div className="flex text-small">{lead}</div>}
          <Callout tone="danger">
            <span className="selectable">{turn.error || m.conversation.timeline.failed}</span>
          </Callout>
        </>
      )
    case 'interrupted':
      return (
        <div className="flex items-center gap-1.5 text-small text-fg-subtle">
          {lead}
          <OctagonX size={14} /> {m.conversation.timeline.stopped(turn.error)}
        </div>
      )
    case 'completed': {
      const usage = usageLine(m, turn.usage)
      const facts = [turn.model.connection, turn.completedAt && duration(m, turn.startedAt, turn.completedAt), usage].filter(Boolean)
      return (
        <div className="flex items-center gap-1.5 text-small text-fg-subtle tabular-nums">
          {lead}
          {facts.join(' · ')}
        </div>
      )
    }
    case 'queued':
    case 'ready':
    case 'inProgress':
    case 'waitingOnApproval':
    case 'waitingOnUserInput':
    case 'waitingOnAgent':
      return null
  }
}

/** A queued turn's input is on the turn row until it starts. */
function QueuedTurn({ turn, jobName }: { turn: TurnRow; jobName: string | undefined }) {
  const m = useT()
  return (
    <div className="flex flex-col items-end gap-1">
      {jobName && <ScheduledBy name={jobName} />}
      <Attachments attachments={turn.attachments} className="opacity-70" />
      {turn.input && (
        <div className="max-w-140 rounded-xl border border-dashed border-line-strong px-3.5 py-2.5 text-body break-words whitespace-pre-wrap text-fg-muted">{turn.input}</div>
      )}
      <span className="flex items-center gap-1 text-small text-fg-subtle">
        <Clock size={14} /> {m.conversation.timeline.queued}
      </span>
    </div>
  )
}
