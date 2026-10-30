// The sidebar's thread list follows thread/list (repo.ThreadRows): only
// top-level threads that are not archived, ordered by updated_at, then
// created_at, then id, newest first, a page at a time. Live updates must keep that, since
// thread/started also announces the threads subagents run in, and
// thread/changed the threads archived or deleted.

import type { ThreadCursor, ThreadRow, ThreadStatus, ThreadSummary, WorkspaceRow } from '@ollupi/protocol'

export function isTopLevel(thread: Pick<ThreadRow, 'parentThreadId'>): boolean {
  return !thread.parentThreadId
}

export function compareThreads(a: ThreadRow, b: ThreadRow): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

/** Where the next page of thread/list starts: after this thread. */
export function threadCursor(t: ThreadRow): ThreadCursor {
  return { updatedAt: t.updatedAt, createdAt: t.createdAt, id: t.id }
}

/** Inserts or refreshes a top-level thread, or drops it once archived. Its
 * status comes from thread/status/changed, so a known one is kept when only
 * the row changed; a thread seen for the first time without one is idle
 * (thread/start). */
export function upsertThread(list: readonly ThreadSummary[], thread: ThreadRow, status?: ThreadStatus): ThreadSummary[] {
  if (!isTopLevel(thread)) return list.slice()
  if (thread.archivedAt) return removeThread(list, thread.id)
  const known = list.find((t) => t.id === thread.id)
  const next: ThreadSummary = { ...thread, status: status ?? known?.status ?? 'idle' }
  return [...list.filter((t) => t.id !== thread.id), next].sort(compareThreads)
}

export function removeThread(list: readonly ThreadSummary[], threadId: string): ThreadSummary[] {
  return list.filter((t) => t.id !== threadId)
}

/** ollupi stores a title only when the app gives one (thread/start,
 * thread/rename), up to this many characters. */
export const MAX_TITLE_LENGTH = 120
const TITLE_FROM_MESSAGE = 60

/** The title a thread starts with: the first line of its first message,
 * cut short, or the name of its first attachment when it has no text. */
export function titleFromMessage(text: string, attachmentNames: readonly string[] = []): string {
  const line = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? attachmentNames[0]?.trim() ?? ''
  const chars = Array.from(line)
  return chars.length > TITLE_FROM_MESSAGE ? chars.slice(0, TITLE_FROM_MESSAGE).join('').trimEnd() + '…' : line
}

export function setThreadStatus(list: readonly ThreadSummary[], threadId: string, status: ThreadStatus): ThreadSummary[] {
  return list.map((t) => (t.id === threadId ? { ...t, status } : t))
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
