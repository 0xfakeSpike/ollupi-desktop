// Agent: the task a subagent was given and a way into its thread. Its
// thread's requests are answered here, since this thread reports the
// subagent's wait as its own status.

import type { ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { Button } from '@ollupi/ui'
import { ArrowUpRight, Bot } from 'lucide-react'
import { openThread } from '../../../domains/conversation'
import { useThreadRequests } from '../../../domains/requests'
import { useT } from '../../../i18n'
import { argumentsApproval, CallRow, RequestCard, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Subagent = Extract<ToolCall, { kind: 'subagent' }>

export const subagent: ToolView<Subagent> = {
  title: (_m, call) => call.task.description,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: SubagentCall,
  approval: argumentsApproval,
}

function SubagentCall({ item, call }: { item: ItemRow; call: Subagent }) {
  const { task } = call
  const childRequests = useThreadRequests(task.threadId)
  const m = useT()
  return (
    <CallRow
      item={item}
      icon={Bot}
      title={subagent.title(m, call)}
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
