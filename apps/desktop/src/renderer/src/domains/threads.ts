// The sidebar's thread list. It mirrors thread/list for each workspace and
// for threads outside any: top-level threads that are not archived, newest
// first, with status from thread/status/changed and rows from the turn
// notifications and thread/changed. Each group is read a page at a time,
// the next page on request. The archived threads are a list of their own,
// read when the sidebar shows it. Renaming, archiving and deleting a
// thread are here too.

import { compareThreads, removeThread, setThreadStatus, threadCursor, unread, upsertThread } from '@ollupi/core'
import type { OllupiClient } from '@ollupi/client'
import type { ThreadRow, ThreadSummary } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { forgetDraft } from './drafts'
import { go, openThreadId, useNavigation } from './navigation'
import { activeWorkspaces, useWorkspaces } from './workspaces'
import { desktop } from '../platform/desktop'

const PAGE_SIZE = 50

/** more: whether a group has threads past those read, by workspace id
 * ('' for threads outside any). */
export const useThreads = create<{ list: ThreadSummary[]; more: Record<string, boolean> }>()(() => ({ list: [], more: {} }))

/** thread/list with archived: across every workspace, newest first.
 * Undefined until the sidebar first shows it. */
export const useArchivedThreads = create<{ list: ThreadRow[] | undefined; more: boolean }>()(() => ({ list: undefined, more: false }))

const groupKey = (t: Pick<ThreadRow, 'workspaceId'>) => t.workspaceId ?? ''

/** Reads a group's first page, or the page after the threads already read. */
async function readGroup(workspaceId: string, from: 'start' | 'more'): Promise<void> {
  const read = useThreads.getState().list.filter((t) => groupKey(t) === workspaceId)
  const last = from === 'more' ? read.at(-1) : undefined
  const page = await gateway().call('thread/list', { workspaceId, after: last && threadCursor(last), limit: PAGE_SIZE })
  useThreads.setState((s) => ({
    list: page.data.reduce((acc, t) => upsertThread(acc, t, t.status), s.list),
    more: { ...s.more, [workspaceId]: page.hasMore },
  }))
}

const update = (fn: (list: ThreadSummary[]) => ThreadSummary[]) => useThreads.setState((s) => ({ list: fn(s.list) }))

/** A thread row changed or went away: both lists follow, and a deleted
 * thread that is on screen gives way to a new one. An archived or deleted
 * thread keeps no browser tabs either: each tab is a page running in the
 * window, and nobody will look at it again. A deleted thread keeps no draft
 * either; an archived one does, for its return. */
function changed(threadId: string, thread: ThreadRow | null): void {
  update((l) => (thread ? upsertThread(l, thread) : removeThread(l, threadId)))
  useArchivedThreads.setState((s) => {
    if (!s.list) return s
    const rest = s.list.filter((t) => t.id !== threadId)
    return { list: thread?.archivedAt && !thread.parentThreadId ? [thread, ...rest].sort(compareThreads) : rest }
  })
  if (!thread || thread.archivedAt) void desktop.browser.forget(threadId)
  if (!thread) forgetDraft(threadId)
  if (!thread && openThreadId() === threadId) go({ kind: 'draft', workspaceId: undefined })
}

/** Threads being marked read, so a burst of changes asks once. */
const marking = new Set<string>()

/** The thread on screen is read while the window is in front: opening it,
 * a turn ending in it, or coming back to the window marks it read in
 * ollupi, which tells every client. A failed mark leaves the dot, and the
 * next of these tries again. */
function markOpenRead(client: OllupiClient): void {
  const id = openThreadId()
  if (!id || marking.has(id) || document.hidden || !document.hasFocus()) return
  const thread = useThreads.getState().list.find((t) => t.id === id)
  if (!thread || !unread(thread)) return
  marking.add(id)
  void client
    .call('thread/markRead', { threadId: id })
    .then(({ thread }) => update((l) => upsertThread(l, thread)))
    .catch(() => undefined)
    .finally(() => marking.delete(id))
}

export const threadsDomain: Domain = {
  bind: (client) => {
    const seen = () => markOpenRead(client)
    window.addEventListener('focus', seen)
    document.addEventListener('visibilitychange', seen)
    const offs = [
      useThreads.subscribe(seen),
      useNavigation.subscribe((now, before) => now.screen !== before.screen && seen()),
      () => window.removeEventListener('focus', seen),
      () => document.removeEventListener('visibilitychange', seen),
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
            void run((e) => e.thread.list, () => readGroup(w.id, 'start'))
          }
        }
      }),
    )
    return () => offs.forEach((off) => off())
  },
  // Runs after workspaces have synced (session order).
  sync: async (client) => {
    const scopes = ['', ...activeWorkspaces(useWorkspaces.getState().list).map((w) => w.id)]
    const pages = await Promise.all(scopes.map((workspaceId) => client.call('thread/list', { workspaceId, limit: PAGE_SIZE })))
    useThreads.setState({
      list: pages.flatMap((p) => p.data).sort(compareThreads),
      more: Object.fromEntries(scopes.map((w, i) => [w, pages[i]!.hasMore])),
    })
    if (useArchivedThreads.getState().list) await loadArchivedThreads('start')
  },
  disconnect: () => useArchivedThreads.setState({ list: undefined, more: false }),
}

/** The next page of a group: a workspace's threads, or those outside any. */
export function loadMoreThreads(workspaceId: string | undefined): Promise<void | undefined> {
  return run((e) => e.thread.list, () => readGroup(workspaceId ?? '', 'more'))
}

export function loadArchivedThreads(from: 'start' | 'more'): Promise<void | undefined> {
  return run((e) => e.thread.archived, async () => {
    const read = from === 'more' ? (useArchivedThreads.getState().list ?? []) : []
    const last = read.at(-1)
    const page = await gateway().call('thread/list', { archived: true, after: last && threadCursor(last), limit: PAGE_SIZE })
    const known = new Set(read.map((t) => t.id))
    useArchivedThreads.setState({ list: [...read, ...page.data.filter((t) => !known.has(t.id))], more: page.hasMore })
  })
}

export function renameThread(threadId: string, title: string): Promise<boolean> {
  return run((e) => e.thread.rename, async () => {
    await gateway().call('thread/rename', { threadId, title })
    return true
  }).then(Boolean)
}

/** ollupi refuses to archive a thread while a turn runs in it (threadBusy). */
export function archiveThread(threadId: string, archived: boolean): Promise<boolean> {
  return run((e) => (archived ? e.thread.archive : e.thread.restore), async () => {
    await gateway().call('thread/archive', { threadId, archived })
    return true
  }).then(Boolean)
}

/** Deletes the thread with its subagents' threads, attachments and
 * scheduled tasks; like archiving, not while a turn runs in it. */
export function deleteThread(threadId: string): Promise<boolean> {
  return run((e) => e.thread.delete, async () => {
    await gateway().call('thread/delete', { threadId })
    return true
  }).then(Boolean)
}

export function useThreadSummary(id: string | undefined): ThreadSummary | undefined {
  return useThreads((s) => (id ? s.list.find((t) => t.id === id) : undefined))
}

export type ThreadAction = 'rename' | 'archive' | 'delete'

/** A thread row's menu, the system's own: what can be done to it, deleting
 * last. Resolves to the action picked, or undefined. */
export async function threadMenu(labels: Record<ThreadAction, string>): Promise<ThreadAction | undefined> {
  const actions: ThreadAction[] = ['rename', 'archive', 'delete']
  const picked = await desktop.contextMenu(actions.map((id) => ({ id, label: labels[id] })))
  return actions.find((a) => a === picked)
}

export type WorkspaceAction = 'reveal' | 'settings' | 'archive'

/** A workspace's menu, the system's own; archiving last. */
export async function workspaceMenu(labels: Record<WorkspaceAction, string>): Promise<WorkspaceAction | undefined> {
  const actions: WorkspaceAction[] = ['reveal', 'settings', 'archive']
  const picked = await desktop.contextMenu(actions.map((id) => ({ id, label: labels[id] })))
  return actions.find((a) => a === picked)
}
