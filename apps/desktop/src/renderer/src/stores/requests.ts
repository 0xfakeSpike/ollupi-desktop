// Server requests waiting on the user (approvals and questions), keyed by
// the tool-call item they belong to. Each holds the resolver of the JSON-RPC
// request, so answering is just calling it.

import type { ApprovalRequest, Decision, UserInputAnswer, UserInputRequest } from '@ollupi/protocol'
import { create } from 'zustand'

export type PendingRequest =
  | { kind: 'approval'; params: ApprovalRequest; respond(decision: Decision): void }
  | { kind: 'userInput'; params: UserInputRequest; respond(answers: Record<string, UserInputAnswer>): void }

interface RequestStore {
  byItem: Record<string, PendingRequest>
  add(request: PendingRequest): void
  remove(itemId: string): void
  /** On disconnect: the server re-sends what is still pending after reconnecting. */
  clear(): void
}

export const useRequests = create<RequestStore>()((set) => ({
  byItem: {},
  add: (r) => set((s) => ({ byItem: { ...s.byItem, [r.params.itemId]: r } })),
  remove: (itemId) =>
    set((s) => {
      if (!(itemId in s.byItem)) return s
      const { [itemId]: _, ...rest } = s.byItem
      return { byItem: rest }
    }),
  clear: () => set({ byItem: {} }),
}))

export function usePendingRequest(itemId: string): PendingRequest | undefined {
  return useRequests((s) => s.byItem[itemId])
}
