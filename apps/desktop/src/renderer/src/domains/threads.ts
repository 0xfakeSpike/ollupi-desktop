// The sidebar's thread list. It mirrors thread/list for each workspace and
// for threads outside any: top-level threads that are not archived, newest
// first, each row as thread/changed last told it, its status among it. Each
// group is read a page at a time, the next page on request. Pages are read
// at different commits and changes can arrive before an older page, so each
// thread keeps the seq it was last set at, and a row or a change older than
// that is passed over. The archived threads are a list of their own,
// read when the sidebar shows it. Renaming, archiving and deleting a
// thread are here too.

import { compareThreads, removeThread, threadCursor, unread, upsertThread } from '@ollupi/core'
import type { OllupiClient } from '@ollupi/client'
import type { ThreadRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { forgetDraft } from './drafts'
import { forgetPanel, go, openThreadId, useNavigation } from './navigation'
import { activeWorkspaces, useWorkspaces } from './workspaces'
import { desktop } from '../platform/desktop'

const PAGE_SIZE = 50

/** more: whether a group has threads past those read, by workspace id. */
export const useThreads = create<{ list: ThreadRow[]; more: Record<string, boolean> }>()(() => ({ list: [], more: {} }))

/** thread/list with archived: across every workspace, newest first.
 * Undefined until the sidebar first shows it. */
export const useArchivedThreads = create<{ list: ThreadRow[] | undefined; more: boolean }>()(() => ({ list: undefined, more: false }))

const groupKey = (t: Pick<ThreadRow, 'workspaceId'>) => t.workspaceId

/** The commit each thread was last set at in a list, a deletion included:
 * one map for the list of those not archived, one for the archived list,
 * since each is read on its own. */
const listedSeqs = new Map<string, number>()
const archivedSeqs = new Map<string, number>()

/** The archived list follows changes from its first read on, the read's
 * own way there included. */
let followArchived = false

/** Whether what a commit at seq says of a thread is newer than what the
 * list holds; if it is, the list holds it from now on. */
function newer(seqs: Map<string, number>, threadId: string, seq: number): boolean {
  if (seq <= (seqs.get(threadId) ?? 0)) return false
  seqs.set(threadId, seq)
  return true
}

/** The rows of a page that are newer than what the list holds. */
const fresh = (seqs: Map<string, number>, page: { data: ThreadRow[]; seq: number }) => page.data.filter((t) => newer(seqs, t.id, page.seq))

/** Reads a group's first page, or the page after the threads already read. */
async function readGroup(workspaceId: string, from: 'start' | 'more'): Promise<void> {
  const read = useThreads.getState().list.filter((t) => groupKey(t) === workspaceId)
  const last = from === 'more' ? read.at(-1) : undefined
  const page = await gateway().call('thread/list', { workspaceId, after: last && threadCursor(last), limit: PAGE_SIZE })
  const rows = fresh(listedSeqs, page)
  useThreads.setState((s) => ({
    list: rows.reduce((acc, t) => upsertThread(acc, t), s.list),
    more: { ...s.more, [workspaceId]: page.hasMore },
  }))
}

/** A thread row changed or went away at seq: each list that holds an older
 * row follows, and a deleted thread that is on screen gives way to a new
 * one. An archived or deleted thread keeps no panel either: its browser's
 * tabs are pages running in the window that nobody will look at again, and
 * its other panels are shut. A deleted thread keeps no draft either; an
 * archived one does, for its return. The archived list is not read until
 * the sidebar shows it, and follows nothing until then. */
function changed(threadId: string, thread: ThreadRow | null, seq: number): void {
  const listed = newer(listedSeqs, threadId, seq)
  if (listed) useThreads.setState((s) => ({ list: thread ? upsertThread(s.list, thread) : removeThread(s.list, threadId) }))
  const archived = followArchived && newer(archivedSeqs, threadId, seq)
  if (archived) {
    useArchivedThreads.setState((s) => {
      const rest = (s.list ?? []).filter((t) => t.id !== threadId)
      return { list: thread?.archivedAt && !thread.parentThreadId ? [thread, ...rest].sort(compareThreads) : rest }
    })
  }
  if (!listed && !archived) return
  if (!thread || thread.archivedAt) {
    void desktop.browser.forget(threadId)
    forgetPanel(threadId)
  }
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
      client.on('thread/changed', ({ threadId, thread, seq }) => changed(threadId, thread, seq)),
    ]
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
    const scopes = activeWorkspaces(useWorkspaces.getState().list).map((w) => w.id)
    const pages = await Promise.all(scopes.map((workspaceId) => client.call('thread/list', { workspaceId, limit: PAGE_SIZE })))
    // What changed while the pages were on their way is in the list already.
    const rows = pages.flatMap((page) => fresh(listedSeqs, page))
    useThreads.setState((s) => ({
      list: rows.reduce((acc, t) => upsertThread(acc, t), s.list),
      more: Object.fromEntries(scopes.map((w, i) => [w, pages[i]!.hasMore])),
    }))
    if (useArchivedThreads.getState().list) await loadArchivedThreads('start')
  },
  disconnect: () => {
    listedSeqs.clear()
    archivedSeqs.clear()
    followArchived = false
    useThreads.setState({ list: [], more: {} })
    useArchivedThreads.setState({ list: undefined, more: false })
  },
}

/** The next page of a workspace's threads. */
export function loadMoreThreads(workspaceId: string): Promise<void | undefined> {
  return run((e) => e.thread.list, () => readGroup(workspaceId, 'more'))
}

export function loadArchivedThreads(from: 'start' | 'more'): Promise<void | undefined> {
  return run((e) => e.thread.archived, async () => {
    const read = from === 'more' ? (useArchivedThreads.getState().list ?? []) : []
    const last = read.at(-1)
    followArchived = true
    const page = await gateway().call('thread/list', { archived: true, after: last && threadCursor(last), limit: PAGE_SIZE })
    const rows = new Map(fresh(archivedSeqs, page).map((t) => [t.id, t]))
    useArchivedThreads.setState((s) => {
      // A first page stands for the list at its commit, but for what
      // changed after it.
      const held = from === 'more' ? (s.list ?? []) : (s.list ?? []).filter((t) => (archivedSeqs.get(t.id) ?? 0) > page.seq)
      const kept = held.map((t) => rows.get(t.id) ?? t)
      const known = new Set(kept.map((t) => t.id))
      return { list: [...kept, ...[...rows.values()].filter((t) => !known.has(t.id))], more: page.hasMore }
    })
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

/** Deletes the thread with its reporting subagents' threads, attachments
 * and scheduled tasks; like archiving, not while a turn runs in it. */
export function deleteThread(threadId: string): Promise<boolean> {
  return run((e) => e.thread.delete, async () => {
    await gateway().call('thread/delete', { threadId })
    return true
  }).then(Boolean)
}

export function useThreadRow(id: string | undefined): ThreadRow | undefined {
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

export type WorkspaceAction = 'settings' | 'archive'

/** A workspace's menu, the system's own; archiving last. */
/** A workspace's menu; a scratch workspace stays with its environment, so it
 * is not archived. */
export async function workspaceMenu(labels: Record<WorkspaceAction, string>, scratch: boolean): Promise<WorkspaceAction | undefined> {
  const actions: WorkspaceAction[] = scratch ? ['settings'] : ['settings', 'archive']
  const picked = await desktop.contextMenu(actions.map((id) => ({ id, label: labels[id] })))
  return actions.find((a) => a === picked)
}
