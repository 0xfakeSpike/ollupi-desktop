// The subagents: the task one was given, the role it runs as, and a way
// into its thread. The launch returns at once. general-sub-agent,
// browser-sub-agent, design-sub-agent and codebase-sub-agent work beside the
// conversation until they write their report back as an agentReport item
// (AgentReport), so the launch shows them working until then, and their
// thread's requests are answered here, since this thread reports their wait
// as its own status. A delegate (delegate-sub-agent) never reports: it is the
// user's own conversation from then on, listed in the sidebar, where its
// requests wait too.

import { type SubagentRole, reportOf, turnActive, type ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Button, Spinner } from '@ollupi/ui'
import { ArrowUpRight, Bot, FolderTree, Forward, Globe, Palette, type LucideIcon } from 'lucide-react'
import { openThread } from '../../../domains/conversation'
import { useThreadRequests } from '../../../domains/requests'
import { useT } from '../../../i18n'
import { useCurrentTimeline } from '../CurrentTimeline'
import { argumentsApproval, CallRow, RequestCard, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Subagent = Extract<ToolCall, { kind: 'subagent' }>

/** How each role shows beside its launch: the icon, and the note that says
 * what it is doing when its task does not. */
const looks: Record<SubagentRole, { icon: LucideIcon; note?: 'browserSubagent' | 'designSubagent' | 'codebaseSubagent' }> = {
  'general-sub-agent': { icon: Bot },
  'browser-sub-agent': { icon: Globe, note: 'browserSubagent' },
  'design-sub-agent': { icon: Palette, note: 'designSubagent' },
  'codebase-sub-agent': { icon: FolderTree, note: 'codebaseSubagent' },
  'delegate-sub-agent': { icon: Forward },
}

export const subagent: ToolView<Subagent> = {
  title: (_m, call) => call.task.description,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: SubagentCall,
  approval: argumentsApproval,
}

function SubagentCall({ item, call }: { item: ItemRow; call: Subagent }) {
  const { task } = call
  // ollupi says whether the launch reports back: a detached one (a
  // delegate) never does.
  const reports = !item.detached
  const childRequests = useThreadRequests(reports ? task.threadId : undefined)
  const timeline = useCurrentTimeline()
  const m = useT()
  // Launched and not reported, while the turn that launched it goes on: a
  // turn that ends stops its subagents, and one ended gets no report.
  const turn = timeline?.turns.find((t) => t.id === item.turnId)
  const working = reports && item.status === 'completed' && !!timeline && !reportOf(timeline.items, item) && !!turn && turnActive(turn.status)
  const look = looks[task.role]
  return (
    <CallRow
      item={item}
      icon={reports ? look.icon : Forward}
      title={subagent.title(m, call)}
      badge={
        <>
          {look.note && <span className="shrink-0 text-small text-fg-subtle">{m.conversation.tool[look.note]}</span>}
          {!reports && <span className="shrink-0 text-small text-fg-subtle">{m.conversation.tool.delegated}</span>}
          {working && (
            <span className="flex shrink-0 items-center gap-1 text-small text-fg-subtle">
              <Spinner size={14} /> {m.conversation.tool.subagentWorking}
            </span>
          )}
        </>
      }
      failure={subagent.failure(m, call, item)}
      after={childRequests.map((r) => (
        <RequestCard key={r.params.itemId} request={r} />
      ))}
    >
      <p className="selectable text-ui break-words whitespace-pre-wrap text-fg-muted">{task.prompt}</p>
      {task.threadId && (
        <div>
          <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => void openThread(task.threadId!)}>
            {m.conversation.tool.openSubagent}
          </Button>
        </div>
      )}
    </CallRow>
  )
}
