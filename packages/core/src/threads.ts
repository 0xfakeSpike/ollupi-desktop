// The sidebar's thread list follows thread/list (repo.ThreadRows): only
// top-level threads, ordered by updated_at then created_at, newest first.
// Live updates must keep that, since thread/started also announces the
// threads subagents run in.

import type { ThreadRow, ThreadStatus, ThreadSummary, WorkspaceRow } from '@ollupi/protocol'

export function isTopLevel(thread: Pick<ThreadRow, 'parentThreadId'>): boolean {
  return !thread.parentThreadId
}

export function compareThreads(a: ThreadRow, b: ThreadRow): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt)
}

/** Inserts or refreshes a top-level thread. Its status comes from
 * thread/status/changed, so a known one is kept when only the row changed;
 * a thread seen for the first time without one is idle (thread/start). */
export function upsertThread(list: readonly ThreadSummary[], thread: ThreadRow, status?: ThreadStatus): ThreadSummary[] {
  if (!isTopLevel(thread)) return list.slice()
  const known = list.find((t) => t.id === thread.id)
  const next: ThreadSummary = { ...thread, status: status ?? known?.status ?? 'idle' }
  return [...list.filter((t) => t.id !== thread.id), next].sort(compareThreads)
}

export function setThreadStatus(list: readonly ThreadSummary[], threadId: string, status: ThreadStatus): ThreadSummary[] {
  return list.map((t) => (t.id === threadId ? { ...t, status } : t))
}

/** The server sets preview to the first line of the first turn's input when
 * that turn starts; before then the thread has no title of its own. */
export function threadTitle(thread: Pick<ThreadRow, 'preview'>): string {
  return thread.preview || 'New thread'
}

/** agent.threadStatus: idle without an inProgress turn; while one exists,
 * waitingOn* when this thread, or a subagent thread it waits on, has a
 * request pending, else active (running, waiting for a slot or for a
 * subagent). So a waiting parent's request may live in a child thread. */
export function needsUser(status: ThreadStatus | undefined): boolean {
  return status === 'waitingOnApproval' || status === 'waitingOnUserInput'
}

export function isWorking(status: ThreadStatus | undefined): boolean {
  return status === 'active'
}

export interface WorkspaceGroup {
  workspace: WorkspaceRow | undefined
  threads: ThreadSummary[]
}

/** Threads under each active workspace (in the given order), then those
 * outside any workspace. Archived workspaces are not listed. */
export function groupByWorkspace(workspaces: readonly WorkspaceRow[], threads: readonly ThreadSummary[]): WorkspaceGroup[] {
  const groups: WorkspaceGroup[] = workspaces
    .filter((w) => !w.archivedAt)
    .map((workspace) => ({ workspace, threads: threads.filter((t) => t.workspaceId === workspace.id) }))
  groups.push({ workspace: undefined, threads: threads.filter((t) => !t.workspaceId) })
  return groups
}
