// Requests the gateway sends that wait on the user: approvals and
// questions. Each keeps the resolver of its JSON-RPC request, so answering
// is calling it. They belong to the connection that received them; after a
// reconnect the gateway sends every pending one again.

import type { ApprovalRequestParams, Decision, UserInputAnswer, UserInputRequestParams } from '@ollupi/protocol'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'

export type PendingRequest =
  | { kind: 'approval'; params: ApprovalRequestParams; respond(decision: Decision): void }
  | { kind: 'question'; params: UserInputRequestParams; respond(answers: Record<string, UserInputAnswer>): void }

const useRequests = create<{ byItem: Record<string, PendingRequest> }>()(() => ({ byItem: {} }))

function add(r: PendingRequest): void {
  useRequests.setState((s) => ({ byItem: { ...s.byItem, [r.params.itemId]: r } }))
}

function remove(itemId: string): void {
  useRequests.setState((s) => {
    if (!(itemId in s.byItem)) return s
    const { [itemId]: _, ...rest } = s.byItem
    return { byItem: rest }
  })
}

export const requestsDomain: Domain = {
  bind: (client) => {
    const offs = [
      client.handle(
        'item/toolCall/requestApproval',
        (params) =>
          new Promise((resolve) =>
            add({
              kind: 'approval',
              params,
              respond: (decision) => {
                remove(params.itemId)
                resolve({ decision })
              },
            }),
          ),
      ),
      client.handle(
        'item/tool/requestUserInput',
        (params) =>
          new Promise((resolve) =>
            add({
              kind: 'question',
              params,
              respond: (answers) => {
                remove(params.itemId)
                resolve({ answers })
              },
            }),
          ),
      ),
      // A request settled elsewhere (another client, or the turn ending)
      // completes its item; nothing is waiting for an answer any more.
      client.on('item/completed', ({ item }) => remove(item.id)),
    ]
    return () => offs.forEach((off) => off())
  },
  disconnect: () => useRequests.setState({ byItem: {} }),
}

export function usePendingRequest(itemId: string): PendingRequest | undefined {
  return useRequests((s) => s.byItem[itemId])
}

/** Requests waiting in one thread, e.g. a subagent's, shown at its parent's
 * call because the parent reports the child's wait as its own status. */
export function useThreadRequests(threadId: string | undefined): PendingRequest[] {
  const byItem = useRequests((s) => s.byItem)
  return threadId ? Object.values(byItem).filter((r) => r.params.threadId === threadId) : []
}
