// The sidebar's thread list. It mirrors thread/list for each workspace and
// for threads outside any: top-level threads that are not archived, newest
// first, with status from thread/status/changed and rows from the turn
// notifications and thread/changed. The archived threads are a list of
// their own, read when the sidebar shows it. Renaming, archiving and
// deleting a thread are here too.

import { compareThreads, removeThread, setThreadStatus, upsertThread } from '@ollupi/core'
import type { ThreadRow, ThreadSummary } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { go, openThreadId } from './navigation'
import { activeWorkspaces, useWorkspaces } from './workspaces'

/** thread/list's maximum; it has no cursor, so each group shows at most this. */
const THREADS_PER_GROUP = 100

export const useThreads = create<{ list: ThreadSummary[] }>()(() => ({ list: [] }))

/** thread/list with archived: across every workspace, newest first.
 * Undefined until the sidebar first shows it. */
export const useArchivedThreads = create<{ list: ThreadRow[] | undefined }>()(() => ({ list: undefined }))

const update = (fn: (list: ThreadSummary[]) => ThreadSummary[]) => useThreads.setState((s) => ({ list: fn(s.list) }))

/** A thread row changed or went away: both lists follow, and a deleted
 * thread that is on screen gives way to a new one. */
function changed(threadId: string, thread: ThreadRow | null): void {
  update((l) => (thread ? upsertThread(l, thread) : removeThread(l, threadId)))
  useArchivedThreads.setState((s) => {
    if (!s.list) return s
    const rest = s.list.filter((t) => t.id !== threadId)
    return { list: thread?.archivedAt && !thread.parentThreadId ? [thread, ...rest].sort(compareThreads) : rest }
  })
  if (!thread && openThreadId() === threadId) go({ kind: 'draft', workspaceId: undefined })
}

export const threadsDomain: Domain = {
  bind: (client) => {
    const offs = [
      client.on('thread/started', ({ thread }) => update((l) => upsertThread(l, thread))),
      client.on('thread/status/changed', ({ threadId, status }) => update((l) => setThreadStatus(l, threadId, status))),
      client.on('thread/changed', ({ threadId, thread }) => changed(threadId, thread)),
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
    if (useArchivedThreads.getState().list) await loadArchivedThreads()
  },
  disconnect: () => useArchivedThreads.setState({ list: undefined }),
}

export function loadArchivedThreads(): Promise<void | undefined> {
  return run((e) => e.thread.archived, async () => {
    const { data } = await gateway().call('thread/list', { archived: true, limit: THREADS_PER_GROUP })
    useArchivedThreads.setState({ list: data })
  })
}

export function renameThread(threadId: string, title: string): Promise<boolean> {
  return run((e) => e.thread.rename, async () => {
    const { thread } = await gateway().call('thread/rename', { threadId, title })
    changed(threadId, thread)
    return true
  }).then(Boolean)
}

/** ollupi refuses to archive a thread while a turn runs in it (threadBusy). */
export function archiveThread(threadId: string, archived: boolean): Promise<boolean> {
  return run((e) => (archived ? e.thread.archive : e.thread.restore), async () => {
    const { thread } = await gateway().call('thread/archive', { threadId, archived })
    changed(threadId, thread)
    return true
  }).then(Boolean)
}

/** Deletes the thread with its subagents' threads, attachments and
 * scheduled tasks; like archiving, not while a turn runs in it. */
export function deleteThread(threadId: string): Promise<boolean> {
  return run((e) => e.thread.delete, async () => {
    await gateway().call('thread/delete', { threadId })
    changed(threadId, null)
    return true
  }).then(Boolean)
}

export function useThreadSummary(id: string | undefined): ThreadSummary | undefined {
  return useThreads((s) => (id ? s.list.find((t) => t.id === id) : undefined))
}
