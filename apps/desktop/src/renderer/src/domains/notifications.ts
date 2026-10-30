// System notifications and the Dock badge: telling the person, while they
// look elsewhere, that a thread needs them (an approval, a question) or that
// a turn ended. Which of those are told is the person's choice, kept in this
// app's own storage. The main process shows a notice only while no window
// is in front; clicking one opens its thread. The badge counts the threads
// waiting on the person.

import { needsUser } from '@ollupi/core'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'
import { t } from '../i18n'
import { threadTitle } from '../i18n/format'
import { desktop } from '../platform/desktop'
import { openThread } from './conversation'
import { onRequest, type PendingRequest } from './requests'
import { useThreads } from './threads'

export const noticeKinds = ['approval', 'question', 'completed', 'failed'] as const
export type NoticeKind = (typeof noticeKinds)[number]

const KEY = 'ollupi.notifications'

function stored(): Record<NoticeKind, boolean> {
  const on = Object.fromEntries(noticeKinds.map((k) => [k, true])) as Record<NoticeKind, boolean>
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<NoticeKind, unknown>>
    for (const k of noticeKinds) if (typeof saved[k] === 'boolean') on[k] = saved[k]
  } catch {
    // An unreadable choice is no choice: every kind stays on.
  }
  return on
}

export const useNotificationPrefs = create<Record<NoticeKind, boolean>>()(stored)

export function setNotification(kind: NoticeKind, on: boolean): void {
  useNotificationPrefs.setState({ [kind]: on })
  localStorage.setItem(KEY, JSON.stringify(useNotificationPrefs.getState()))
}

/** Requests the gateway sends again after a reconnect were told already. */
const told = new Set<string>()

function titleOf(threadId: string): string {
  const thread = useThreads.getState().list.find((x) => x.id === threadId)
  // A subagent's thread is not in the list; its request is the parent's wait.
  return thread ? threadTitle(t(), thread) : 'Ollupi'
}

function tellRequest(r: PendingRequest): void {
  if (told.has(r.params.itemId)) return
  told.add(r.params.itemId)
  if (!useNotificationPrefs.getState()[r.kind]) return
  const m = t().notifications
  const body = r.kind === 'approval' ? m.approval(r.params.tool) : m.question(r.params.questions[0]?.question ?? '')
  void desktop.notify({ threadId: r.params.threadId, title: titleOf(r.params.threadId), body })
}

export const notificationsDomain: Domain = {
  bind: (client) => {
    const offs = [
      onRequest(tellRequest),
      client.on('turn/completed', ({ thread, turn }) => {
        // A subagent's turn ending is its parent's business, told when that ends.
        if (thread.parentThreadId) return
        const kind = turn.status === 'completed' ? 'completed' : turn.status === 'failed' ? 'failed' : undefined
        if (!kind || !useNotificationPrefs.getState()[kind]) return
        const m = t().notifications
        void desktop.notify({ threadId: thread.id, title: threadTitle(t(), thread), body: kind === 'completed' ? m.completed : m.failed(turn.error ?? '') })
      }),
    ]
    return () => offs.forEach((off) => off())
  },
}

/** Follows the thread list for the badge and notification clicks for the
 * whole life of the window. Called once when it loads. */
export function startNotifications(): void {
  const count = (list: ReturnType<typeof useThreads.getState>['list']) => list.filter((x) => needsUser(x.status)).length
  let shown = -1
  const badge = () => {
    const n = count(useThreads.getState().list)
    if (n !== shown) void desktop.setBadge((shown = n))
  }
  useThreads.subscribe(badge)
  badge()
  desktop.onNoticeClicked((threadId) => void openThread(threadId))
}
