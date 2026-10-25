// Server-owned collections the whole app reads: workspaces, threads, models.
// Updates go through @ollupi/core so ordering rules live in one place.

import { setThreadStatus, sortThreads, upsertThread } from '@ollupi/core'
import type { Model, ThreadRow, ThreadStatus, ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { create } from 'zustand'

interface CatalogStore {
  workspaces: WorkspaceRow[]
  threads: ThreadSummary[]
  models: Model[]
  defaultModel: string
  loaded: boolean
  hydrate(data: { workspaces: WorkspaceRow[]; threads: ThreadSummary[]; models: Model[]; defaultModel: string }): void
  upsertWorkspace(ws: WorkspaceRow): void
  upsertThread(thread: ThreadRow, status?: ThreadStatus): void
  setThreadStatus(threadId: string, status: ThreadStatus): void
}

export const useCatalog = create<CatalogStore>()((set) => ({
  workspaces: [],
  threads: [],
  models: [],
  defaultModel: '',
  loaded: false,
  hydrate: ({ workspaces, threads, models, defaultModel }) =>
    set({ workspaces, threads: sortThreads(threads), models, defaultModel, loaded: true }),
  upsertWorkspace: (ws) =>
    set((s) => ({
      workspaces: s.workspaces.some((w) => w.id === ws.id)
        ? s.workspaces.map((w) => (w.id === ws.id ? ws : w))
        : [...s.workspaces, ws],
    })),
  upsertThread: (thread, status) => set((s) => ({ threads: upsertThread(s.threads, thread, status) })),
  setThreadStatus: (threadId, status) => set((s) => ({ threads: setThreadStatus(s.threads, threadId, status) })),
}))

export function useWorkspace(id: string | undefined): WorkspaceRow | undefined {
  return useCatalog((s) => (id ? s.workspaces.find((w) => w.id === id) : undefined))
}

export function useThreadSummary(id: string | undefined): ThreadSummary | undefined {
  return useCatalog((s) => (id ? s.threads.find((t) => t.id === id) : undefined))
}
