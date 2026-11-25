// The user's todos: what the Super Agent has to do for them, the ones it
// handed to a conversation, and those done or dropped. ollupi keeps them in
// its todos table (todo/list), so the app holds a mirror of that list and
// nothing else: no file stands behind them. Every change ollupi reports as
// todo/changed, with the todo as it is then, so applying those newer than
// the list (seq) keeps it current, whichever arrives first; the todo/* calls below change todos, and their results
// are not applied here, the notification is.

import { errorMessage } from '@ollupi/client'
import type { TodoChangedNotification, TodoRow, TodoStatus } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

/** As many todos as ollupi's todo/list gives at most. */
const LIMIT = 2000

/** Every status, so the list holds the archive too: todo/list with none
 * gives only the todos not ended. */
const STATUSES: TodoStatus[] = ['open', 'handed', 'done', 'dropped']

export const useTodos = create<{
  /** Every todo in ollupi's order (store.Todos): those not ended yet by id,
   * then those ended, the latest ended first. Undefined until the first list
   * arrives. */
  list: TodoRow[] | undefined
  /** There are more todos than the app asked for: the list stops at LIMIT. */
  more: boolean
  /** Why the list could not be read, as ollupi said it (old todos that
   * failed to import, say); the panel shows it rather than an empty list. */
  error: string | undefined
}>()(() => ({ list: undefined, more: false, error: undefined }))

/** Whether a todo is finished with: done or dropped, in the archive. */
export function ended(todo: TodoRow): boolean {
  return todo.status === 'done' || todo.status === 'dropped'
}

/** A todo with the todos under it that are drawn with it. */
export interface TodoNode {
  todo: TodoRow
  children: TodoNode[]
}

/** The todos of one list as ollupi nests them (a todo's parentId, at most
 * three levels): each under its parent when the parent is in the same list,
 * at the top otherwise, so a part handed out while its parent waits stands
 * with the handed ones. Siblings keep the order of the list. */
export function nest(todos: readonly TodoRow[]): TodoNode[] {
  const nodes = new Map(todos.map((todo) => [todo.id, { todo, children: [] as TodoNode[] }]))
  const roots: TodoNode[] = []
  for (const node of nodes.values()) {
    const parent = node.todo.parentId ? nodes.get(node.todo.parentId) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  return roots
}

/** The order todo/list gives, so a change lands where a fresh list would
 * put it: not ended first, then the latest ended, and by id within either. */
function compare(a: TodoRow, b: TodoRow): number {
  if (!a.endedAt !== !b.endedAt) return a.endedAt ? 1 : -1
  if (a.endedAt && b.endedAt && a.endedAt !== b.endedAt) return b.endedAt.localeCompare(a.endedAt)
  return a.id - b.id
}

function upsert(list: readonly TodoRow[] | undefined, todo: TodoRow): TodoRow[] {
  return [...(list ?? []).filter((t) => t.id !== todo.id), todo].sort(compare)
}

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ todo, seq }: TodoChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useTodos.setState((s) => ({ list: upsert(s.list, todo), error: undefined }))
}

export const todosDomain: Domain = {
  bind: (client) => client.on('todo/changed', changed),
  // A list that cannot be read is no reason to reconnect the session: the
  // panel says why, and the next connection (or todo/changed) reads it again.
  sync: async (client) => {
    try {
      const { result, newer } = await client.snapshot('todo/list', { statuses: STATUSES, limit: LIMIT }, ['todo/changed'])
      seen = result.seq
      useTodos.setState({ list: result.data ?? [], more: !!result.more, error: undefined })
      newer.forEach((e) => changed(e.params))
    } catch (err) {
      useTodos.setState({ error: errorMessage(err) })
    }
  },
  disconnect: () => {
    seen = 0
    useTodos.setState({ list: undefined, more: false, error: undefined })
  },
}

function setStatus(todo: TodoRow, status: TodoStatus): Promise<void | undefined> {
  return run((e) => e.todos.update, async () => {
    await gateway().call('todo/update', { id: todo.id, status })
  })
}

/** Marks a todo done. What it came to (the result) the Super Agent fills in
 * when it checks the work; the checkbox only ends the todo. */
export function completeTodo(todo: TodoRow): Promise<void | undefined> {
  return setStatus(todo, 'done')
}

export function dropTodo(todo: TodoRow): Promise<void | undefined> {
  return setStatus(todo, 'dropped')
}

/** Puts a finished todo back among those to do. */
export function reopenTodo(todo: TodoRow): Promise<void | undefined> {
  return setStatus(todo, 'open')
}

/** Hands a todo to a conversation, whose workspace comes with it, or back to
 * nobody ('': no conversation, no project). The todo's status stays what it
 * is; only the Super Agent marks one handed when it starts the work. */
export function assignTodo(todo: TodoRow, threadId: string): Promise<void | undefined> {
  return run((e) => e.todos.update, async () => {
    await gateway().call('todo/update', { id: todo.id, threadId })
  })
}
