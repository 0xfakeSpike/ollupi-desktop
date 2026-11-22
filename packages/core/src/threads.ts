// The sidebar's thread list follows thread/list (store.Threads): the
// top-level threads and the delegates that are not archived, ordered by
// updated_at, then created_at, then id, newest first, a page at a time. Live
// updates must keep that, since thread/changed also announces the threads
// reporting subagents run in, and the threads archived or deleted.

import type { ThreadCursor, ThreadRow, ThreadStatus, WorkspaceRow } from '@ollupi/protocol'

/** A conversation the user started, or a delegate: one a conversation handed
 * work to that never reports back, whose replies are the user's to read. A
 * subagent that reports is part of the turn that launched it instead. */
export function isListed(thread: Pick<ThreadRow, 'parentThreadId' | 'role'>): boolean {
  return !thread.parentThreadId || thread.role === 'delegate-sub-agent'
}

/** The user's hub: the one workspace whose conversations hand work out to
 * the projects (the app's Super Agent), if they have one that is not
 * archived. */
export function hubOf(workspaces: readonly WorkspaceRow[]): WorkspaceRow | undefined {
  return workspaces.find((w) => w.kind === 'hub' && !w.archivedAt)
}

export function compareThreads(a: ThreadRow, b: ThreadRow): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

/** Where the next page of thread/list starts: after this thread. */
export function threadCursor(t: ThreadRow): ThreadCursor {
  return { updatedAt: t.updatedAt, createdAt: t.createdAt, id: t.id }
}

/** Inserts or refreshes a listed thread, or drops it once archived. */
export function upsertThread(list: readonly ThreadRow[], thread: ThreadRow): ThreadRow[] {
  if (!isListed(thread)) return list.slice()
  if (thread.archivedAt) return removeThread(list, thread.id)
  return [...list.filter((t) => t.id !== thread.id), thread].sort(compareThreads)
}

export function removeThread(list: readonly ThreadRow[], threadId: string): ThreadRow[] {
  return list.filter((t) => t.id !== threadId)
}

/** The conversation a link in a message names: #thread-<conversation id>. */
export function threadLink(href: string | undefined): string | undefined {
  return href?.startsWith('#thread-') ? href.slice('#thread-'.length) || undefined : undefined
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

/** ThreadRow.Unread: a turn ended after the user last read the thread
 * (thread/markRead). The times are parsed, as their fractions of a second
 * differ in length. */
export function unread(thread: Pick<ThreadRow, 'repliedAt' | 'readAt'>): boolean {
  if (!thread.repliedAt) return false
  return !thread.readAt || Date.parse(thread.repliedAt) > Date.parse(thread.readAt)
}

export function needsUser(status: ThreadStatus | undefined): boolean {
  return status === 'waitingOnApproval' || status === 'waitingOnUserInput'
}

export function isWorking(status: ThreadStatus | undefined): boolean {
  return status === 'active'
}

export interface WorkspaceGroup {
  workspace: WorkspaceRow | undefined
  threads: ThreadRow[]
}

/** Threads under each active project workspace, then those outside any
 * workspace. Archived workspaces are not listed, nor the hub, which the
 * sidebar shows on its own (hubOf). What waits on the person comes first:
 * in each group the threads waiting on an approval or an answer, then the
 * rest, and the workspaces holding such a thread before the others. Past
 * that, the workspace worked in last comes first: its latest thread's
 * activity, or its own change (a workspace just added has no thread yet).
 * Threads keep thread/list's order, newest first. The order is the
 * sidebar's alone: the list itself stays thread/list's, as its last thread
 * is where the next page starts. */
export function groupByWorkspace(workspaces: readonly WorkspaceRow[], threads: readonly ThreadRow[]): WorkspaceGroup[] {
  const groups: WorkspaceGroup[] = workspaces
    .filter((w) => !w.archivedAt && w.kind !== 'hub')
    .map((workspace) => ({ workspace, threads: waitingFirst(threads.filter((t) => t.workspaceId === workspace.id)) }))
    .map((g) => ({ g, last: lastActivity(g) }))
    .sort((a, b) => b.last - a.last)
    .map(({ g }) => g)
  const waits = (g: WorkspaceGroup) => g.threads.some((t) => needsUser(t.status))
  return [...groups.filter(waits), ...groups.filter((g) => !waits(g)), { workspace: undefined, threads: waitingFirst(threads.filter((t) => !t.workspaceId)) }]
}

/** When a workspace was last worked in, as a time to compare: the later of
 * its own change and its newest thread's. The times are parsed, as their
 * fractions of a second differ in length. */
function lastActivity(g: WorkspaceGroup): number {
  const times = [g.workspace?.updatedAt, ...g.threads.map((t) => t.updatedAt)].map((at) => (at ? Date.parse(at) : NaN)).filter((t) => !Number.isNaN(t))
  return times.length ? Math.max(...times) : -Infinity
}

/** What waits on the person first, each part in the order given. */
export function waitingFirst(threads: readonly ThreadRow[]): ThreadRow[] {
  return [...threads.filter((t) => needsUser(t.status)), ...threads.filter((t) => !needsUser(t.status))]
}
