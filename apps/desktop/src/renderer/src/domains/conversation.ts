// Conversations: the loaded timeline of each opened thread, kept live from
// turn and item notifications, and the user's intents on them (start a
// thread, send, steer, queue, interrupt, page back).

import { RpcError } from '@ollupi/client'
import {
  activeTurn,
  applyEvent,
  emptyTimeline,
  oldestSeq,
  prependPage,
  refreshFromPage,
  setThread,
  timelineFromPage,
  upsertThread,
  upsertTurn,
  type Timeline,
  type TimelineEvent,
} from '@ollupi/core'
import { ErrorCode, type PermissionSettings } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { chooseModel, go, openThreadId, useNavigation } from './navigation'
import { useThreads } from './threads'

/** Items per page; the gateway also cuts a page at about 4 MB and then
 * reports hasMore. */
const PAGE_SIZE = 100

export const useTimelines = create<{ byThread: Record<string, Timeline> }>()(() => ({ byThread: {} }))

/** Notifications for a thread nobody opened are dropped: opening it reads
 * the current state. */
function update(threadId: string, fn: (t: Timeline) => Timeline): void {
  useTimelines.setState((s) => {
    const t = s.byThread[threadId]
    return t ? { byThread: { ...s.byThread, [threadId]: fn(t) } } : s
  })
}

function store(threadId: string, t: Timeline): void {
  useTimelines.setState((s) => ({ byThread: { ...s.byThread, [threadId]: t } }))
}

export const conversationDomain: Domain = {
  bind: (client) => {
    const apply = (e: TimelineEvent) => update(e.params.threadId, (t) => applyEvent(t, e))
    const offs = [
      client.on('turn/queued', (params) => apply({ method: 'turn/queued', params })),
      client.on('turn/started', (params) => apply({ method: 'turn/started', params })),
      client.on('turn/completed', (params) => apply({ method: 'turn/completed', params })),
      client.on('item/started', (params) => apply({ method: 'item/started', params })),
      client.on('item/completed', (params) => apply({ method: 'item/completed', params })),
      client.on('item/agentMessage/delta', (params) => apply({ method: 'item/agentMessage/delta', params })),
      client.on('item/reasoning/textDelta', (params) => apply({ method: 'item/reasoning/textDelta', params })),
    ]
    return () => offs.forEach((off) => off())
  },
  // Events were missed while disconnected: re-read the open thread and drop
  // the others, which reload when opened.
  sync: async (client) => {
    const open = openThreadId()
    const kept = open ? useTimelines.getState().byThread[open] : undefined
    useTimelines.setState({ byThread: {} })
    if (!open) return
    const page = await client.call('thread/resume', { threadId: open, limit: PAGE_SIZE })
    store(open, kept ? refreshFromPage(kept, page) : timelineFromPage(page))
  },
}

export function useTimeline(threadId: string | undefined): Timeline | undefined {
  return useTimelines((s) => (threadId ? s.byThread[threadId] : undefined))
}

/** Opens a thread. thread/resume also makes the gateway re-send requests
 * still waiting in it. */
export function openThread(threadId: string): Promise<void | undefined> {
  go({ kind: 'thread', threadId })
  return run('Could not open the thread', async () => {
    if (useTimelines.getState().byThread[threadId]) return
    store(threadId, timelineFromPage(await gateway().call('thread/resume', { threadId, limit: PAGE_SIZE })))
  })
}

export function loadOlder(threadId: string): Promise<void | undefined> {
  return run('Could not load earlier messages', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const beforeSeq = t && oldestSeq(t)
    if (!t?.hasMore || beforeSeq === undefined) return
    const page = await gateway().call('thread/read', { threadId, beforeSeq, limit: PAGE_SIZE })
    update(threadId, (cur) => prependPage(cur, page))
  })
}

/** Starts a thread from the draft screen with its first message. */
export function startThread(workspaceId: string | undefined, text: string): Promise<boolean> {
  return run('Could not start the thread', async () => {
    const { thread } = await gateway().call('thread/start', { workspaceId, permissions: {} })
    store(thread.id, emptyTimeline(thread))
    useThreads.setState((s) => ({ list: upsertThread(s.list, thread) }))
    const model = useNavigation.getState().model
    go({ kind: 'thread', threadId: thread.id })
    chooseModel(model)
    await startTurn(thread.id, text)
    return true
  }).then(Boolean)
}

export type SendMode = 'steer' | 'queue'

/** Sends a message. While a turn runs, "steer" adds it to that turn
 * (turn/steer) and "queue" makes it a new turn that starts after it; on an
 * idle thread both start a turn. A steer that loses the race with the turn
 * ending (NoActiveTurn, TurnMismatch) is sent as a new turn instead, which
 * is what the message needs. */
export function sendMessage(threadId: string, text: string, mode: SendMode): Promise<boolean> {
  return run('Could not send the message', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running && mode === 'steer') {
      try {
        await gateway().call('turn/steer', { threadId, input: [{ type: 'text', text }], expectedTurnId: running.id })
        return true
      } catch (err) {
        const ended = err instanceof RpcError && (err.code === ErrorCode.noActiveTurn || err.code === ErrorCode.turnMismatch)
        if (!ended) throw err
      }
    }
    await startTurn(threadId, text)
    return true
  }).then(Boolean)
}

async function startTurn(threadId: string, text: string): Promise<void> {
  const connection = useNavigation.getState().model
  const { turn } = await gateway().call('turn/start', { threadId, input: [{ type: 'text', text }], connection })
  update(threadId, (t) => upsertTurn(t, turn))
}

export function interrupt(threadId: string): Promise<void | undefined> {
  return run('Could not stop the turn', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running) await gateway().call('turn/interrupt', { threadId, turnId: running.id })
  })
}

export function updateThreadPermissions(threadId: string, settings: PermissionSettings): Promise<boolean> {
  return run('Could not save the thread permissions', async () => {
    const { thread } = await gateway().call('thread/updatePermissions', { threadId, ...settings })
    update(threadId, (t) => setThread(t, thread))
    useThreads.setState((s) => ({ list: upsertThread(s.list, thread) }))
    return true
  }).then(Boolean)
}
