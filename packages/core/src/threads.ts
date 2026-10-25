// The thread list in the sidebar: summaries kept newest first, with live
// status from thread/status/changed.

import type { ThreadRow, ThreadStatus, ThreadSummary, WorkspaceRow } from '@ollupi/protocol'

export function sortThreads(list: readonly ThreadSummary[]): ThreadSummary[] {
  return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Inserts or refreshes a thread, keeping a status already known for it. */
export function upsertThread(
  list: readonly ThreadSummary[],
  thread: ThreadRow,
  status?: ThreadStatus,
): ThreadSummary[] {
  const prev = list.find((t) => t.id === thread.id)
  const next: ThreadSummary = { ...thread, status: status ?? prev?.status ?? 'idle' }
  return sortThreads([...list.filter((t) => t.id !== thread.id), next])
}

export function setThreadStatus(
  list: readonly ThreadSummary[],
  threadId: string,
  status: ThreadStatus,
): ThreadSummary[] {
  return list.map((t) => (t.id === threadId ? { ...t, status } : t))
}

/** Subagent threads belong under their parent's tool call, not the sidebar. */
export function topLevelThreads(list: readonly ThreadSummary[]): ThreadSummary[] {
  return list.filter((t) => !t.parentThreadId)
}

export function threadTitle(thread: Pick<ThreadRow, 'preview'>): string {
  const line = thread.preview.trim().split('\n')[0] ?? ''
  return line || 'New thread'
}

export function isBusy(status: ThreadStatus | undefined): boolean {
  return status !== undefined && status !== 'idle'
}

export function needsAttention(status: ThreadStatus | undefined): boolean {
  return status === 'waitingOnApproval' || status === 'waitingOnUserInput'
}

export interface WorkspaceGroup {
  workspace: WorkspaceRow | undefined
  threads: ThreadSummary[]
}

/** Groups threads under active workspaces (in the given order), then the
 * threads outside any workspace. Archived workspaces are left out. */
export function groupThreadsByWorkspace(
  workspaces: readonly WorkspaceRow[],
  threads: readonly ThreadSummary[],
): WorkspaceGroup[] {
  const active = workspaces.filter((w) => !w.archivedAt)
  const groups: WorkspaceGroup[] = active.map((workspace) => ({
    workspace,
    threads: threads.filter((t) => t.workspaceId === workspace.id),
  }))
  const loose = threads.filter((t) => !t.workspaceId)
  groups.push({ workspace: undefined, threads: loose })
  return groups
}
