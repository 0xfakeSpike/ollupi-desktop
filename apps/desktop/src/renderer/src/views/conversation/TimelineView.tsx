// A timeline as turns: what started each turn, its items, and how it ended.
// Items are drawn by ItemView; a turn reads as core's layoutTurn: the
// person's words, the process (Process) and the answer.

import { groupByTurn, layoutTurn, queuedTurns, summarizeProcess, turnActive, type Timeline, type TurnGroup, type TurnPart } from '@ollupi/core'
import type { TurnRow } from '@ollupi/protocol'
import { Button, Callout, EmptyState } from '@ollupi/ui'
import { CalendarClock, Clock, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadOlder, retryTurn } from '../../domains/conversation'
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
import { ResultFiles } from './ResultFiles'
import { Wolf } from '../common/Wolf'

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
        {groups.length === 0 && queued.length === 0 && (
          <EmptyState icon={<Wolf pose="sit" className="size-16" />} title={m.conversation.timeline.empty}>
            {m.conversation.timeline.emptyHint}
          </EmptyState>
        )}
        {groups.map((g, i) => (
          <TurnSection key={g.turn.id} group={g} jobName={jobNames(g.turn)} latest={latest} last={i === groups.length - 1 && queued.length === 0 && !timeline.thread.archivedAt && !timeline.thread.parentThreadId} />
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

function TurnSection({ group, jobName, latest, last }: { group: TurnGroup; jobName: string | undefined; latest: string | undefined; last: boolean }) {
  const { turn, items } = group
  const parts = useMemo(() => layoutTurn(items), [items])
  const ended = !turnActive(turn.status)
  const answered = parts.some((p) => p.kind === 'answer')
  // The answer once the turn is over, as written (Markdown), to copy.
  const answer = ended ? parts.flatMap((p) => (p.kind === 'answer' && p.item.text ? [p.item.text] : [])).join('\n\n') : ''
  const m = useT()
  // Once it is over, the result comes first: the answer and the files it
  // made, then the one line that folds how it got there. A turn that was
  // steered keeps its order, as its steps belong between its messages.
  const shown = useMemo(() => (ended && answered ? resultFirst(parts) : parts), [parts, ended, answered])
  const changed = useMemo(() => (ended ? summarizeProcess(items).changedPaths : []), [items, ended])
  return (
    <section className="group/turn flex flex-col gap-5">
      {jobName && <ScheduledBy name={jobName} />}
      {shown.map((p) =>
        p.kind === 'process' ? (
          <Process key={p.items[0]!.id} items={p.items} ended={ended} answered={answered} endedAt={turn.completedAt ?? undefined} />
        ) : (
          // Takes no box, so the section's gap stays; a search finds the item by it.
          <div key={p.item.id} data-item-id={p.item.id} className="contents">
            <ItemView item={p.item} editable={p.item.id === latest} />
            {p.kind === 'answer' && <ResultFiles paths={changed} />}
          </div>
        ),
      )}
      <TurnOutcome turn={turn} retry={last} copy={answer ? <CopyButton text={answer} label={m.conversation.timeline.copyAnswer} /> : null} />
    </section>
  )
}

/** One message, its process, its answer: the answer moves ahead of the
 * process. Anything else stays as it happened. */
function resultFirst(parts: TurnPart[]): TurnPart[] {
  if (parts.length !== 3) return parts
  const [message, process, answer] = parts
  return message!.kind === 'message' && process!.kind === 'process' && answer!.kind === 'answer' ? [message!, answer!, process!] : parts
}

function ScheduledBy({ name }: { name: string }) {
  const m = useT()
  return (
    <div className="flex items-center justify-end gap-1.5 text-small text-fg-subtle">
      <CalendarClock size={14} /> {m.conversation.timeline.sentBy(name)}
    </div>
  )
}

/** How the turn ended, led by the copy button for its answer when it has one.
 * The thread's last turn, when it failed, can be sent again. */
function TurnOutcome({ turn, copy, retry }: { turn: TurnRow; copy: ReactNode; retry: boolean }) {
  const m = useT()
  // The 24px button keeps to the line's height and its icon to the column's edge.
  const lead = copy && <span className="-my-1 -ml-1.5 flex">{copy}</span>
  switch (turn.status) {
    case 'failed':
      return (
        <>
          {lead && <div className="flex text-small">{lead}</div>}
          <Callout tone="danger">
            <div className="flex items-start gap-3">
              <span className="selectable min-w-0 flex-1">{turn.error || m.conversation.timeline.failed}</span>
              {retry && <RetryButton turn={turn} />}
            </div>
          </Callout>
        </>
      )
    case 'interrupted':
      return (
        <div className="flex items-center gap-1.5 text-small text-fg-subtle">
          {lead}
          <Square size={10} fill="currentColor" aria-hidden /> {m.conversation.timeline.stopped(turn.error)}
        </div>
      )
    case 'completed': {
      const usage = usageLine(m, turn.usage)
      const facts = [turn.model.connection, turn.completedAt && duration(m, turn.startedAt, turn.completedAt), usage].filter(Boolean)
      // Which model, how long, how much: one step further, shown while the
      // turn is pointed at or focused (PRODUCT.md, principle 0).
      return (
        <div className="flex items-center gap-1.5 text-small text-fg-subtle tabular-nums opacity-0 transition-opacity duration-160 ease-standard group-focus-within/turn:opacity-100 group-hover/turn:opacity-100">
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

function RetryButton({ turn }: { turn: TurnRow }) {
  const [sending, setSending] = useState(false)
  const m = useT()
  return (
    <Button
      size="sm"
      icon={<RotateCcw size={14} />}
      loading={sending}
      className="-my-0.5"
      onClick={() => {
        setSending(true)
        void retryTurn(turn).finally(() => setSending(false))
      }}
    >
      {m.conversation.timeline.retry}
    </Button>
  )
}

/** A queued turn's input is on the turn row until it starts. */
function QueuedTurn({ turn, jobName }: { turn: TurnRow; jobName: string | undefined }) {
  const m = useT()
  return (
    <div className="flex flex-col items-end gap-1">
      {jobName && <ScheduledBy name={jobName} />}
      <Attachments attachments={turn.attachments} className="opacity-70" />
      {turn.input && (
        <div className="max-w-130 rounded-3xl rounded-br-md border-2 border-dashed border-line-strong px-4.5 py-3 text-body break-words whitespace-pre-wrap text-fg-muted">{turn.input}</div>
      )}
      <span className="flex items-center gap-1 text-small text-fg-subtle">
        <Clock size={14} /> {m.conversation.timeline.queued}
      </span>
    </div>
  )
}
