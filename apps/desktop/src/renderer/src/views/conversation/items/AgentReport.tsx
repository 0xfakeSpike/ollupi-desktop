// What came back from work that ran apart from its turn (an agentReport
// item): a subagent's final answer, or the end of a call run in the
// background, whose result the call itself shows (asRan).

import { callOf, formatValue } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { ProcessRow } from '@ollupi/ui'
import { Bot, Hourglass } from 'lucide-react'
import { useT } from '../../../i18n'
import { Markdown } from '../../common/Markdown'
import { useCurrentTimeline } from '../CurrentTimeline'
import { viewOf } from '../tools'
import { ErrorText } from '../tools/CallRow'

export function AgentReport({ item }: { item: ItemRow }) {
  return item.taskId ? <TaskReport item={item} /> : <SubagentReport item={item} />
}

/** A subagent's final answer, or why it has none. Its text is the
 * subagent's task. */
function SubagentReport({ item }: { item: ItemRow }) {
  const m = useT()
  const failed = item.status === 'failed'
  const report = formatValue(item.result?.output)
  return (
    <ProcessRow
      icon={<Bot size={14} className={failed ? 'text-danger' : undefined} />}
      title={m.conversation.items.subagentReport(item.text ?? '')}
      meta={failed && <span className="text-danger">{m.conversation.tool.failed}</span>}
    >
      {report && <Markdown text={report} />}
      {item.error && <ErrorText text={item.error} />}
    </ProcessRow>
  )
}

/** Where a background call's result came back, which the agent goes on
 * from: named after the call, which shows what it did. */
function TaskReport({ item }: { item: ItemRow }) {
  const m = useT()
  const launch = useCurrentTimeline()?.items.find((it) => it.id === item.launchItemId)
  const call = launch && callOf(launch)
  const name = call ? viewOf(call).title(m, call) : m.common.tool.unnamed
  const failed = item.status === 'failed'
  return (
    <ProcessRow
      icon={<Hourglass size={14} className={failed ? 'text-danger' : undefined} />}
      quiet
      title={m.conversation.items.taskReport(name)}
      meta={failed && <span className="text-danger">{m.conversation.tool.failed}</span>}
    />
  )
}
