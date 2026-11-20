// The hub's tools, as the Super Agent's conversation shows them: work
// handed to a project (a conversation started there, or a message to one),
// a change to the user's todos, and a look at how things stand. Handing out
// and todos are what it did for the user, so they read as results with a
// way into the conversation; looking around is a quiet line.

import { parseArguments, type ToolCall } from '@ollupi/core'
import { isToolPart, type ItemRow, type TodoStatus } from '@ollupi/protocol'
import { Button } from '@ollupi/ui'
import { ArrowUpRight, Eye, ListChecks, Send } from 'lucide-react'
import { openThread } from '../../../domains/conversation'
import { useThreadRow } from '../../../domains/threads'
import { useWorkspace } from '../../../domains/workspaces'
import { useT, type Messages } from '../../../i18n'
import { threadTitle } from '../../../i18n/format'
import { argumentsApproval, CallRow, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Handoff = Extract<ToolCall, { kind: 'handoff' }>
type Todo = Extract<ToolCall, { kind: 'todo' }>
type Followup = Extract<ToolCall, { kind: 'followup' }>

/** The conversation's title as the sidebar knows it, or a stand-in when it
 * is not loaded. */
function useConversationTitle(id: string | undefined): string {
  const m = useT()
  const row = useThreadRow(id)
  return row ? threadTitle(m, row) : m.conversation.tool.hub.someConversation
}

export const handoff: ToolView<Handoff> = {
  title: (m, call) =>
    call.handoff.tool === 'start_conversation' ? m.conversation.tool.hub.start(call.handoff.args.title, m.conversation.tool.hub.someWorkspace) : m.conversation.tool.hub.send(m.conversation.tool.hub.someConversation),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: HandoffCall,
  approval: argumentsApproval,
}

function HandoffCall({ item, call }: { item: ItemRow; call: Handoff }) {
  const m = useT()
  const h = m.conversation.tool.hub
  const { handoff: work, output } = call
  const target = work.tool === 'start_conversation' ? output?.conversation : work.args.conversation
  const workspace = useWorkspace(work.tool === 'start_conversation' ? work.args.workspace : undefined)
  const conversation = useConversationTitle(target)
  const title = work.tool === 'start_conversation' ? h.start(work.args.title, workspace?.name ?? h.someWorkspace) : h.send(conversation)
  return (
    <CallRow
      item={item}
      icon={Send}
      title={title}
      badge={output?.queued && <span className="shrink-0 text-small text-fg-subtle">{h.queued}</span>}
      failure={handoff.failure(m, call, item)}
    >
      <p className="selectable text-ui break-words whitespace-pre-wrap text-fg-muted">{work.args.message}</p>
      {target && item.status === 'completed' && (
        <div>
          <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => void openThread(target)}>
            {m.conversation.tool.openSubagent}
          </Button>
        </div>
      )}
    </CallRow>
  )
}

/** A todo's change in words: what it became when its status changed, else
 * that it changed. */
function todoTitle(m: Messages, call: Todo): string {
  const h = m.conversation.tool.hub
  const { change, output } = call
  if (change.tool === 'add_todo') return h.addTodo(output?.title ?? change.args.title)
  const name = output?.title ?? change.args.title ?? h.todoNumber(change.args.id)
  const status: TodoStatus | undefined = change.args.status
  return status ? h.todoTo[status](name) : h.updateTodo(name)
}

export const todo: ToolView<Todo> = {
  title: todoTitle,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: TodoCall,
  approval: argumentsApproval,
}

function TodoCall({ item, call }: { item: ItemRow; call: Todo }) {
  const m = useT()
  const notes = call.change.args.notes
  const result = call.change.tool === 'update_todo' ? call.change.args.result : undefined
  const detail = [notes, result].filter(Boolean).join('\n\n')
  return (
    <CallRow item={item} icon={ListChecks} title={todoTitle(m, call)} failure={todo.failure(m, call, item)}>
      {detail && <p className="selectable text-ui break-words whitespace-pre-wrap text-fg-muted">{detail}</p>}
    </CallRow>
  )
}

export const followup: ToolView<Followup> = {
  title: (m, call) => {
    const h = m.conversation.tool.hub
    return call.tool === 'read_conversation' ? h.read_conversation(h.someConversation) : h[call.tool]
  },
  failure: (m, _call, item) => statusFailure(m, item),
  Call: FollowupCall,
  approval: argumentsApproval,
}

function FollowupCall({ item, call }: { item: ItemRow; call: Followup }) {
  const m = useT()
  const h = m.conversation.tool.hub
  const args = parseArguments(item)
  const read = call.tool === 'read_conversation' && isToolPart('read_conversation', 'arguments', args) ? args.conversation : undefined
  const conversation = useConversationTitle(read)
  const title = call.tool === 'read_conversation' ? h.read_conversation(conversation) : h[call.tool]
  return <CallRow item={item} icon={Eye} title={title} failure={followup.failure(m, call, item)} />
}
