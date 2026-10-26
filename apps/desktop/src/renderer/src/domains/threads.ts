// The sidebar's thread list. It mirrors thread/list for each workspace and
// for threads outside any: top-level threads only, newest first, with status
// from thread/status/changed and rows from the turn notifications.

import { compareThreads, setThreadStatus, upsertThread } from '@ollupi/core'
import type { ThreadSummary } from '@ollupi/protocol'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'
import { activeWorkspaces, useWorkspaces } from './workspaces'

/** thread/list's maximum; it has no cursor, so each group shows at most this. */
export const THREADS_PER_GROUP = 100

export const useThreads = create<{ list: ThreadSummary[] }>()(() => ({ list: [] }))

const update = (fn: (list: ThreadSummary[]) => ThreadSummary[]) => useThreads.setState((s) => ({ list: fn(s.list) }))

export const threadsDomain: Domain = {
  bind: (client) => {
    const offs = [
      client.on('thread/started', ({ thread }) => update((l) => upsertThread(l, thread))),
      client.on('thread/status/changed', ({ threadId, status }) => update((l) => setThreadStatus(l, threadId, status))),
    ]
    for (const event of ['turn/queued', 'turn/started', 'turn/completed'] as const) {
      offs.push(client.on(event, ({ thread }) => update((l) => upsertThread(l, thread))))
    }
    // A workspace restored from the archive has threads nobody listed yet.
    offs.push(
      useWorkspaces.subscribe((now, before) => {
        const was = new Set(activeWorkspaces(before.list).map((w) => w.id))
        for (const w of activeWorkspaces(now.list)) {
          if (!was.has(w.id) && before.list.some((b) => b.id === w.id)) {
            void client.call('thread/list', { workspaceId: w.id, limit: THREADS_PER_GROUP }).then(({ data }) =>
              update((l) => data.reduce((acc, t) => upsertThread(acc, t, t.status), l)),
            )
          }
        }
      }),
    )
    return () => offs.forEach((off) => off())
  },
  // Runs after workspaces have synced (session order).
  sync: async (client) => {
    const scopes = ['', ...activeWorkspaces(useWorkspaces.getState().list).map((w) => w.id)]
    const pages = await Promise.all(scopes.map((workspaceId) => client.call('thread/list', { workspaceId, limit: THREADS_PER_GROUP })))
    useThreads.setState({ list: pages.flatMap((p) => p.data).sort(compareThreads) })
  },
}

export function useThreadSummary(id: string | undefined): ThreadSummary | undefined {
  return useThreads((s) => (id ? s.list.find((t) => t.id === id) : undefined))
}
