// The user's todos, which the hub (the app's Super Agent) keeps and the
// user can change too: todo/list gives them all in the order they were
// added, and todo/changed sends each one as it is written, by either.

import type { TodoRow, TodoStatus } from '@ollupi/protocol'

export function upsertTodo(list: readonly TodoRow[], todo: TodoRow): TodoRow[] {
  return [...list.filter((t) => t.id !== todo.id), todo].sort((a, b) => a.id - b.id)
}

/** Still to be done: not handed out yet, or handed to a conversation that
 * works on it. */
export function isOpenTodo(status: TodoStatus): boolean {
  return status === 'open' || status === 'handed'
}

export interface TodoGroups {
  /** Not handed out yet, oldest first. */
  open: TodoRow[]
  /** Handed to a conversation, oldest first. */
  handed: TodoRow[]
  /** Done or dropped, the one closed last first. */
  closed: TodoRow[]
}

export function groupTodos(list: readonly TodoRow[]): TodoGroups {
  const closedAt = (t: TodoRow) => Date.parse(t.doneAt ?? t.updatedAt)
  return {
    open: list.filter((t) => t.status === 'open'),
    handed: list.filter((t) => t.status === 'handed'),
    closed: list.filter((t) => !isOpenTodo(t.status)).sort((a, b) => closedAt(b) - closedAt(a)),
  }
}
