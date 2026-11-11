// A turn's process (core's layoutTurn): the steps the agent took between
// the person's words and its answer. While the turn runs they are shown as
// they happen. Once it has ended they fold into one line that says what was
// done (packages/ui/DESIGN.md §3.1, the process summary), unless there
// is no answer to read in their place; opening it, or a search landing in
// it, keeps it open.

import { callOf, groupReads, summarizeProcess, waitsForAnswer, waitsForApproval } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { ProcessRow } from '@ollupi/ui'
import { ListChecks } from 'lucide-react'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useNavigation } from '../../domains/navigation'
import { useT, type Messages } from '../../i18n'
import { duration } from '../../i18n/format'
import { ItemView } from './items/ItemView'
import { AgentMessage } from './items/Messages'
import { ReadsRow } from './tools/ReadsRow'
import { viewOf } from './tools'

export function Process({ items, ended, answered, endedAt }: { items: ItemRow[]; ended: boolean; answered: boolean; endedAt: string | undefined }) {
  const m = useT()
  const [chosen, setChosen] = useState<boolean>()
  const focused = useNavigation((s) => !!s.focus && items.some((i) => i.id === s.focus!.itemId))
  // A search led here: the item must be on screen for it to be shown, and
  // stays so once the focus is spent.
  useLayoutEffect(() => {
    if (focused) setChosen(true)
  }, [focused])
  const steps = <Steps items={items} />
  // What waits on the person is never folded away.
  if (!ended || items.some((i) => waitsForApproval(i) || waitsForAnswer(i))) return steps
  const failed = failures(m, items)
  return (
    <ProcessRow
      icon={<ListChecks size={14} />}
      title={summaryLine(m, items, endedAt)}
      meta={failed > 0 && <span className="text-danger">{m.conversation.process.failed(failed)}</span>}
      open={focused || (chosen ?? !answered)}
      onOpenChange={setChosen}
    >
      {steps}
    </ProcessRow>
  )
}

function Steps({ items }: { items: ItemRow[] }) {
  const shown = useMemo(() => groupReads(items), [items])
  return (
    <div className="flex flex-col gap-3">
      {shown.map((g) =>
        g.kind === 'reads' ? (
          <ReadsRow key={g.items[0]!.id} group={g} />
        ) : (
          // Takes no box, so the gap stays; a search finds the item by it.
          <div key={g.item.id} data-item-id={g.item.id} className="contents">
            {g.item.type === 'agentMessage' ? <AgentMessage item={g.item} quiet /> : <ItemView item={g.item} />}
          </div>
        ),
      )}
    </div>
  )
}

/** "Worked for 25s · 6 commands · read 3 files": what was done, by kind. */
function summaryLine(m: Messages, items: ItemRow[], endedAt: string | undefined): string {
  const s = summarizeProcess(items)
  const p = m.conversation.process
  return [
    p.worked(duration(m, s.startedAt, s.completedAt ?? endedAt)),
    s.commands > 0 && p.commands(s.commands),
    s.reads > 0 && p.reads(s.reads),
    s.searches > 0 && p.searches(s.searches),
    s.filesChanged > 0 && p.filesChanged(s.filesChanged),
    s.subagents > 0 && p.subagents(s.subagents),
    s.tools > 0 && p.tools(s.tools),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The steps that failed, as their own rows say: a call by its view's
 * rule (a command by its exit), an error always. */
function failures(m: Messages, items: ItemRow[]): number {
  return items.filter((i) => {
    if (i.type === 'error') return true
    if (i.type !== 'toolCall') return false
    const call = callOf(i)
    return !!viewOf(call).failure(m, call, i)
  }).length
}
