// Lays out a timeline as turns: the items of each turn, then how it ended.
// Individual items are drawn by ItemView.

import { duration, groupByTurn, queuedTurns, usageLine, type Timeline, type TurnGroup } from '@ollupi/core'
import type { ItemRow, ThreadStatus, TurnRow } from '@ollupi/protocol'
import { Button } from '@ollupi/ui'
import { Clock, OctagonX, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { loadOlder } from '../../services/actions/threads'
import { useThreadSummary } from '../../stores/catalog'
import { ItemView } from './items/ItemView'

export function TimelineView({ timeline }: { timeline: Timeline }) {
  const groups = useMemo(() => groupByTurn(timeline), [timeline])
  const queued = queuedTurns(timeline)
  const status = useThreadSummary(timeline.thread.id)?.status

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-6 pb-10">
      {timeline.hasMore && <LoadOlder threadId={timeline.thread.id} />}
      {groups.length === 0 && queued.length === 0 && (
        <div className="py-16 text-center text-sm text-fg-subtle">No messages yet.</div>
      )}
      {groups.map((g) => (
        <TurnSection key={g.turn?.id ?? g.items[0]!.id} group={g} status={status} />
      ))}
      {queued.map((t) => (
        <QueuedTurn key={t.id} turn={t} />
      ))}
    </div>
  )
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

function TurnSection({ group, status }: { group: TurnGroup; status: ThreadStatus | undefined }) {
  const { turn, items } = group
  // While the thread waits on an approval or answer, the card says so instead.
  const running = turn?.status === 'inProgress' && status !== 'waitingOnApproval' && status !== 'waitingOnUserInput'
  return (
    <section className="flex flex-col gap-3">
      {items.map((item) => (
        <ItemView key={item.id} item={item} />
      ))}
      {running && !isStreaming(items.at(-1)) && <Working />}
      {turn && <TurnOutcome turn={turn} />}
    </section>
  )
}

function isStreaming(item: ItemRow | undefined): boolean {
  return !!item && item.status === 'inProgress' && (item.type === 'agentMessage' || item.type === 'reasoning')
}

function Working() {
  return <div className="shimmer w-fit text-[13px]">Working…</div>
}

function TurnOutcome({ turn }: { turn: TurnRow }) {
  switch (turn.status) {
    case 'failed':
      return (
        <div className="selectable flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="break-words">{turn.error || 'The turn failed.'}</span>
        </div>
      )
    case 'interrupted':
      return (
        <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <OctagonX size={12} /> Stopped
        </div>
      )
    case 'completed': {
      const usage = usageLine(turn.usage)
      return (
        <div className="flex gap-2 text-[11px] text-fg-subtle">
          <span>{turn.model.name}</span>
          {turn.completedAt && <span>· {duration(turn.startedAt, turn.completedAt)}</span>}
          {usage && <span>· {usage}</span>}
        </div>
      )
    }
    default:
      return null
  }
}

function QueuedTurn({ turn }: { turn: TurnRow }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[80%] rounded-2xl border border-dashed border-line-strong px-4 py-2 text-sm whitespace-pre-wrap text-fg-muted">
        {turn.input}
      </div>
      <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
        <Clock size={11} /> Queued
      </span>
    </div>
  )
}
