// The Super Agent's todos beside its conversations, kept by ollupi
// (domains/todos) and drawn as a list: those a conversation is working on
// first, then the ones nobody has taken yet, each with its project, where
// its conversation stands and a way into it; under them the archive, a month
// at a time. A todo is changed here: its checkbox ends it, and a row's
// actions drop it, put it back or hand it to another conversation. What a
// todo came to (its result) is the Super Agent's to write when it checks
// the work.

import { isWorking, needsUser, unread } from '@ollupi/core'
import type { TodoRow } from '@ollupi/protocol'
import { cn, EmptyState, IconButton, Picker, type PickerOption } from '@ollupi/ui'
import { ArrowUpRight, Check, Circle, CircleCheck, CircleDot, ListTodo, MessagesSquare, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { openThread } from '../../domains/conversation'
import { useThreadRow, useThreads } from '../../domains/threads'
import { assignTodo, completeTodo, dropTodo, ended, reopenTodo, useTodos } from '../../domains/todos'
import { useWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { threadTitle, workspaceName } from '../../i18n/format'
import { useAreaClass } from '../common/useAreaClass'
import { SidePanel } from './SidePanel'

export function TodosPanel() {
  const t = useT().conversation.todos
  const list = useTodos((s) => s.list)
  const error = useTodos((s) => s.error)
  const more = useTodos((s) => s.more)
  // Handed out or only pointed at a conversation: either way a conversation
  // is where it is worked on, so it is no longer unassigned.
  const open = (list ?? []).filter((todo) => todo.status === 'open' && !todo.threadId)
  const handed = (list ?? []).filter((todo) => todo.status === 'handed' || (todo.status === 'open' && !!todo.threadId))
  const finished = (list ?? []).filter(ended)

  return (
    <SidePanel panel="todos" title={t.title} closeLabel={t.close}>
      <div className="flex flex-col gap-5">
        {error ? (
          // A list that could not be read says why, rather than looking empty.
          <p className="px-1 text-small text-fg-muted">{t.loadFailed(error)}</p>
        ) : list === undefined ? null : list.length === 0 ? (
          <EmptyState icon={<ListTodo size={20} />} title={t.emptyTitle}>
            {t.empty}
          </EmptyState>
        ) : (
          <>
            <Group title={t.inProgress} todos={handed} />
            <Group title={t.unassigned} todos={open} />
            {more && <p className="px-1 text-small text-fg-subtle">{t.moreShown}</p>}
          </>
        )}
        <Archive todos={finished} />
      </div>
    </SidePanel>
  )
}

/** Todos under a heading that counts them, as one block of rows. */
function Group({ title, todos }: { title?: string; todos: TodoRow[] }) {
  if (todos.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <h3 className="flex items-baseline justify-between px-1 text-small font-medium text-fg-subtle">
          <span>{title}</span>
          <span className="tabular-nums">{todos.length}</span>
        </h3>
      )}
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </ul>
    </section>
  )
}

/** A todo in two lines at most: its checkbox and what it is, with its
 * actions on the right when it is pointed at or focused; then its project,
 * its note, what it came to and the conversation working on it. A finished
 * one reads quieter; a dropped one is struck through. */
function TodoItem({ todo }: { todo: TodoRow }) {
  const m = useT()
  const t = m.conversation.todos
  const finished = ended(todo)
  const detail = todo.workspaceId || todo.notes || todo.result || todo.threadId
  return (
    <li className="group relative flex min-w-0 flex-col gap-1 py-2.5 pr-2.5 pl-2">
      <div className="flex min-h-6 min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={finished ? t.reopen : t.done}
          onClick={() => void (finished ? reopenTodo(todo) : completeTodo(todo))}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-fg-subtle transition duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          {finished ? (
            <CircleCheck size={15} aria-hidden />
          ) : todo.status === 'handed' ? (
            <CircleDot size={15} className="text-fg" aria-hidden />
          ) : (
            <Circle size={15} aria-hidden />
          )}
        </button>
        <span className={cn('line-clamp-2 min-w-0 flex-1 text-ui break-words', finished ? 'text-fg-muted' : 'font-medium text-fg', todo.status === 'dropped' && 'line-through')}>
          {todo.title}
        </span>
        {todo.status === 'dropped' && <span className="shrink-0 text-small text-fg-subtle">{t.dropped}</span>}
        {/* Over the row rather than in it, so the text does not shift; kept
            while the assign picker is open, whose trigger lives here. */}
        <div className="absolute top-2.5 right-2.5 hidden h-6 items-center rounded-full bg-surface pl-1 group-focus-within:flex group-hover:flex has-[[aria-expanded=true]]:flex">
          {finished ? (
            <IconButton label={t.reopen} size="sm" onClick={() => void reopenTodo(todo)}>
              <RotateCcw size={13} />
            </IconButton>
          ) : (
            <>
              <IconButton label={t.done} size="sm" onClick={() => void completeTodo(todo)}>
                <Check size={13} />
              </IconButton>
              <IconButton label={t.drop} size="sm" onClick={() => void dropTodo(todo)}>
                <X size={13} />
              </IconButton>
              <Assign todo={todo} />
            </>
          )}
        </div>
      </div>
      {detail && (
        <div className="flex min-w-0 items-start gap-2 pl-9.5">
          {todo.workspaceId && <Project id={todo.workspaceId} />}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {todo.notes && <p className="line-clamp-2 text-small break-words text-fg-muted">{todo.notes}</p>}
            {todo.result && <p className="line-clamp-2 text-small break-words text-fg-subtle">{t.resultOf(todo.result)}</p>}
          </div>
          {todo.threadId && <Conversation id={todo.threadId} />}
        </div>
      )}
    </li>
  )
}

/** The project a todo belongs to, in its workspace's colour. */
function Project({ id }: { id: string }) {
  const m = useT()
  const workspace = useWorkspace(id)
  const area = useAreaClass(id)
  if (!workspace) return null
  return (
    <span className={cn('flex h-5 max-w-28 shrink-0 items-center rounded-full px-2 text-caption text-fg', area)}>
      <span className="truncate">{workspaceName(m, workspace)}</span>
    </span>
  )
}

/** Hands a todo to a conversation, or back to nobody, from a list of the
 * conversations there are. */
function Assign({ todo }: { todo: TodoRow }) {
  const m = useT()
  const t = m.conversation.todos
  const threads = useThreads((s) => s.list)
  const workspaces = useWorkspaces((s) => s.list)
  const options = useMemo(() => {
    const active = threads.filter((thread) => !thread.archivedAt)
    const names = new Map(workspaces.map((w) => [w.id, workspaceName(m, w)]))
    const options: PickerOption<string>[] = [
      { value: '', label: t.noConversation, description: active.length === 0 ? t.noThreads : undefined },
    ]
    for (const thread of active) {
      const project = thread.workspaceId ? names.get(thread.workspaceId) : undefined
      options.push({
        value: thread.id,
        label: threadTitle(m, thread),
        group: project,
        search: `${thread.title} ${project ?? ''}`,
      })
    }
    return options
  }, [threads, workspaces, m, t])

  return (
    <Picker
      label={t.assign}
      value={todo.threadId ?? ''}
      options={options}
      onChange={(id) => void assignTodo(todo, id)}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      filter={options.length > 1 ? { placeholder: t.filterThreads, empty: t.noMatch } : undefined}
    >
      <MessagesSquare size={13} aria-hidden />
    </Picker>
  )
}

/** Where the conversation working on a todo stands, as its sidebar row says
 * it (waiting for you, working, new since read); and a button into it. */
function Conversation({ id }: { id: string }) {
  const m = useT()
  const s = m.shell.sidebar
  const row = useThreadRow(id)
  const name = row ? threadTitle(m, row) : m.conversation.tool.openSubagent
  return (
    <span className="flex shrink-0 items-center gap-1">
      {row &&
        (needsUser(row.status) ? (
          <span className="rounded-full bg-accent px-2 text-caption leading-5 font-semibold text-accent-fg">{s.yours}</span>
        ) : isWorking(row.status) ? (
          <span className="rounded-full bg-canvas px-2 text-caption leading-5 font-semibold text-fg-muted">{s.working}</span>
        ) : unread(row) ? (
          <span role="img" aria-label={s.unread} className="mx-1 size-1.5 rounded-full bg-fg" />
        ) : null)}
      <IconButton label={m.conversation.todos.openThread(name)} size="sm" onClick={() => void openThread(id)}>
        <ArrowUpRight size={14} />
      </IconButton>
    </span>
  )
}

/** The archive, a month at a time: the months as capsules, and the one
 * picked under them, drawn as the todos are. None is open at first. */
function Archive({ todos }: { todos: TodoRow[] }) {
  const t = useT().conversation.todos
  const locale = useLocale((s) => s.locale)
  const [month, setMonth] = useState<string>()
  // The list comes newest ended first, so the months do too.
  const months = useMemo(() => [...new Set(todos.map(monthOf))], [todos])
  if (months.length === 0) return null
  const shown = month ? todos.filter((todo) => monthOf(todo) === month) : []
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-small font-medium text-fg-subtle">{t.archive}</h3>
      <div className="flex flex-wrap gap-1.5">
        {months.map((mo) => (
          <button
            key={mo}
            type="button"
            aria-pressed={mo === month}
            onClick={() => setMonth(mo === month ? undefined : mo)}
            className={cn(
              'h-7 rounded-full px-3 text-small font-medium tabular-nums transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              mo === month ? 'bg-ink text-ink-fg' : 'bg-surface text-fg-muted hover:text-fg',
            )}
          >
            {monthName(mo, locale)}
          </button>
        ))}
      </div>
      {month && (shown.length > 0 ? <Group todos={shown} /> : <p className="px-1 pt-1 text-small text-fg-subtle">{t.noTasks}</p>)}
    </section>
  )
}

/** The month a todo was ended in, YYYY-MM; one still open falls back to when
 * it last moved. */
function monthOf(todo: TodoRow): string {
  return (todo.endedAt ?? todo.updatedAt).slice(0, 7)
}

/** 2026-11 as the locale says a month: 2026年11月, Nov 2026. */
function monthName(month: string, locale: string): string {
  const [y, mo] = month.split('-').map(Number)
  return new Date(y!, mo! - 1, 1).toLocaleDateString(locale, { year: 'numeric', month: 'short' })
}
