// The user's todos, kept by the Super Agent (ollupi's hub) and by the user
// alike. ollupi sends every write as todo/changed, whoever made it, before
// it answers the call that made it, so the calls below leave the list to it.

import { upsertTodo } from '@ollupi/core'
import type { TodoRow, TodoUpdateParams } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

export const useTodos = create<{ list: TodoRow[] }>()(() => ({ list: [] }))

export const todosDomain: Domain = {
  bind: (client) => client.on('todo/changed', ({ todo }) => useTodos.setState((s) => ({ list: upsertTodo(s.list, todo) }))),
  sync: async (client) => {
    const { data } = await client.call('todo/list', {})
    useTodos.setState({ list: data })
  },
}

export function addTodo(title: string): Promise<boolean> {
  return run((e) => e.todo.add, async () => {
    await gateway().call('todo/add', { title })
    return true
  }).then(Boolean)
}

export function updateTodo(change: TodoUpdateParams): Promise<boolean> {
  return run((e) => e.todo.update, async () => {
    await gateway().call('todo/update', change)
    return true
  }).then(Boolean)
}
