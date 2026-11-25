import type { TodoRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import { nest, type TodoNode } from './todos'

const todo = (id: number, parentId?: number): TodoRow => ({ id, parentId, title: `t${id}`, status: 'open', createdAt: '', updatedAt: '' })
const ids = (nodes: TodoNode[]): unknown[] => nodes.map((n) => (n.children.length ? [n.todo.id, ids(n.children)] : n.todo.id))

describe('nest', () => {
  it('puts each todo under its parent, three levels deep, siblings in list order', () => {
    expect(ids(nest([todo(1), todo(2, 1), todo(3, 2), todo(4), todo(5, 1)]))).toEqual([[1, [[2, [3]], 5]], 4])
  })

  it('finds a parent listed after its part', () => {
    expect(ids(nest([todo(3, 1), todo(1)]))).toEqual([[1, [3]]])
  })

  it('keeps a todo at the top when its parent is not in the list', () => {
    expect(ids(nest([todo(2, 1), todo(3, 2)]))).toEqual([[2, [3]]])
  })
})
