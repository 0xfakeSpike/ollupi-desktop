// The user's todos beside a Super Agent conversation: what is left to hand
// out, what a project's conversation is working on (a way into it), and,
// folded away, what was done or dropped. The Super Agent keeps them as it
// plans and hands work out; the user adds, completes, drops and reopens
// them here too, and both see the other's changes as they are made.

import { groupTodos, isOpenTodo } from '@ollupi/core'
import type { TodoRow } from '@ollupi/protocol'
import { Button, cn, EmptyState, IconButton, Input } from '@ollupi/ui'
import { ArrowUpRight, Check, ListTodo, RotateCcw, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { openThread } from '../../domains/conversation'
import { useThreadRow } from '../../domains/threads'
import { addTodo, updateTodo, useTodos } from '../../domains/todos'
import { useWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'
import { areaClass } from '../common/areas'
import { SidePanel } from './SidePanel'

export function TodosPanel() {
  const m = useT()
  const t = m.conversation.todos
  const list = useTodos((s) => s.list)
  const groups = groupTodos(list)
  const [showClosed, setShowClosed] = useState(false)
  const [title, setTitle] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = title.trim()
    if (!text) return
    // Cleared at once, so the next can be typed while this one is added; a
    // failed one comes back unless something new was typed meanwhile.
    setTitle('')
    if (!(await addTodo(text))) setTitle((now) => now || text)
  }

  return (
    <SidePanel panel="todos" title={t.title} closeLabel={t.close}>
      <div className="flex flex-col gap-5">
        <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
          <Input value={title} aria-label={t.addLabel} placeholder={t.addPlaceholder} className="min-w-0 flex-1" onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" size="md" disabled={!title.trim()}>
            {t.add}
          </Button>
        </form>
        {groups.open.length + groups.handed.length === 0 && groups.closed.length === 0 ? (
          <EmptyState icon={<ListTodo size={20} />} title={t.emptyTitle}>
            {t.empty}
          </EmptyState>
        ) : (
          <>
            <TodoGroup title={t.open} todos={groups.open} />
            <TodoGroup title={t.handed} todos={groups.handed} />
            {groups.closed.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowClosed(!showClosed)}
                  className="self-start rounded-full text-small font-medium text-fg-muted hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
                >
                  {showClosed ? t.hideClosed : t.showClosed(groups.closed.length)}
                </button>
                {showClosed && <TodoGroup title={t.closed} todos={groups.closed} />}
              </div>
            )}
          </>
        )}
      </div>
    </SidePanel>
  )
}

function TodoGroup({ title, todos }: { title: string; todos: TodoRow[] }) {
  if (todos.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-small font-medium text-fg-subtle">{title}</h3>
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        {todos.map((todo) => (
          <TodoEntry key={todo.id} todo={todo} />
        ))}
      </ul>
    </section>
  )
}

/** A todo: its title, where it went and what came of it; on hover, the two
 * changes that fit where it stands. */
function TodoEntry({ todo }: { todo: TodoRow }) {
  const m = useT()
  const t = m.conversation.todos
  const workspace = useWorkspace(todo.workspaceId)
  const thread = useThreadRow(todo.threadId)
  const open = isOpenTodo(todo.status)
  const note = todo.result || todo.notes
  return (
    <li className="group relative flex flex-col gap-1 px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2 pr-14">
        <span className={cn('min-w-0 flex-1 text-ui break-words', open ? 'font-medium text-fg' : 'text-fg-muted')}>{todo.title}</span>
        {todo.status === 'dropped' && <span className="shrink-0 text-small text-fg-subtle">{t.dropped}</span>}
      </div>
      {(workspace || todo.threadId) && (
        <div className="flex min-w-0 items-center gap-1.5">
          {workspace && (
            <span className={cn('flex h-5 max-w-32 shrink-0 items-center rounded-full px-2 text-caption text-fg', areaClass(workspace.id))}>
              <span className="truncate">{workspace.name}</span>
            </span>
          )}
          {todo.threadId && (
            <button
              type="button"
              onClick={() => void openThread(todo.threadId!)}
              className="flex min-w-0 items-center gap-1 rounded-full text-small text-fg-muted hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
            >
              <span className="truncate">{thread ? threadTitle(m, thread) : m.conversation.tool.openSubagent}</span>
              <ArrowUpRight size={12} className="shrink-0" aria-hidden />
            </button>
          )}
        </div>
      )}
      {note && <p className="line-clamp-3 text-small break-words whitespace-pre-wrap text-fg-muted">{note}</p>}
      <div className="absolute top-2.5 right-3 hidden items-center group-focus-within:flex group-hover:flex">
        {open ? (
          <>
            <IconButton label={t.done} size="sm" onClick={() => void updateTodo({ id: todo.id, status: 'done' })}>
              <Check size={13} />
            </IconButton>
            <IconButton label={t.drop} size="sm" onClick={() => void updateTodo({ id: todo.id, status: 'dropped' })}>
              <X size={13} />
            </IconButton>
          </>
        ) : (
          // Reopened, it goes back to where it was: handed while a conversation has it.
          <IconButton label={t.reopen} size="sm" onClick={() => void updateTodo({ id: todo.id, status: todo.threadId ? 'handed' : 'open' })}>
            <RotateCcw size={13} />
          </IconButton>
        )}
      </div>
    </li>
  )
}
