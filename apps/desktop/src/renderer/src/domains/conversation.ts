// Conversations: the loaded timeline of each opened thread, kept live from
// the thread's, turns' and items' changes, and the user's intents on them
// (start a thread, send, steer, queue, interrupt, page back).

import { RpcError, type OllupiClient } from '@ollupi/client'
import {
  activeTurn,
  applyEvent,
  emptyTimeline,
  oldestSeq,
  prependPage,
  refreshFromPage,
  timelineFromPage,
  titleFromMessage,
  type Timeline,
  type TimelineEvent,
  type TimelineEventName,
} from '@ollupi/core'
import { ErrorCode, type ItemRow, type PermissionSettings, type ThreadPageResult, type UserInput } from '@ollupi/protocol'
import { create } from 'zustand'
import { DRAFT_BROWSER } from '../../../shared/ipc'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { attachmentFile, withMessageInput } from './attachments'
import { reopenDraft } from './drafts'
import { chosenEnvironment } from './environments'
import { chooseModel, focusItem, go, handOverPanel, openThreadId, useNavigation } from './navigation'
import { desktop } from '../platform/desktop'

/** Items per page; the gateway also cuts a page at about 4 MB and then
 * reports hasMore. */
const PAGE_SIZE = 100

const useTimelines = create<{ byThread: Record<string, Timeline> }>()(() => ({ byThread: {} }))

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

const TIMELINE_EVENTS: TimelineEventName[] = ['thread/changed', 'turn/changed', 'item/changed', 'item/delta']

/** Reads a thread's latest page with what changed in it while the page was
 * on its way, which the page does not have: nothing holds the thread until
 * the page arrives, so those changes found no timeline to go to. replay
 * applies them to the timeline made from the page, and gives undefined
 * when one of them deleted the thread. */
async function resume(client: OllupiClient, threadId: string): Promise<{ page: ThreadPageResult; replay: (t: Timeline) => Timeline | undefined }> {
  const { result: page, newer } = await client.snapshot('thread/resume', { threadId, limit: PAGE_SIZE }, TIMELINE_EVENTS)
  const mine = newer.filter((e) => e.params.threadId === threadId)
  const replay = (t: Timeline) => {
    if (mine.some((e) => e.method === 'thread/changed' && !e.params.thread)) return undefined
    return mine.reduce((acc, e) => applyEvent(acc, e), t)
  }
  return { page, replay }
}

export const conversationDomain: Domain = {
  bind: (client) => {
    const apply = (e: TimelineEvent) => update(e.params.threadId, (t) => applyEvent(t, e))
    const offs = [
      // A renamed or archived thread changes its row; a deleted one is gone.
      client.on('thread/changed', (params) =>
        params.thread
          ? apply({ method: 'thread/changed', params })
          : useTimelines.setState((s) => {
              const { [params.threadId]: _, ...rest } = s.byThread
              return { byThread: rest }
            }),
      ),
      client.on('turn/changed', (params) => apply({ method: 'turn/changed', params })),
      client.on('item/changed', (params) => apply({ method: 'item/changed', params })),
      client.on('item/delta', (params) => apply({ method: 'item/delta', params })),
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
    try {
      const { page, replay } = await resume(client, open)
      const t = replay(kept ? refreshFromPage(kept, page) : timelineFromPage(page))
      if (t) store(open, t)
      else go({ kind: 'draft', workspaceId: undefined })
    } catch (err) {
      // Gone since it was opened (deleted elsewhere, or a reload outlived
      // it): a new conversation, rather than a connection that never syncs.
      if (!(err instanceof RpcError && err.code === ErrorCode.notFound)) throw err
      go({ kind: 'draft', workspaceId: undefined })
    }
  },
  disconnect: () => useTimelines.setState({ byThread: {} }),
}

export function useTimeline(threadId: string | undefined): Timeline | undefined {
  return useTimelines((s) => (threadId ? s.byThread[threadId] : undefined))
}

/** Opens a thread. thread/resume also makes the gateway re-send requests
 * still waiting in it. */
export function openThread(threadId: string): Promise<void | undefined> {
  go({ kind: 'thread', threadId })
  return run((e) => e.thread.open, async () => {
    if (useTimelines.getState().byThread[threadId]) return
    const { page, replay } = await resume(gateway(), threadId)
    const t = replay(timelineFromPage(page))
    if (t) store(threadId, t)
  })
}

/** Opens a thread at one of its items: earlier pages are read until the
 * item's seq is loaded, then the timeline brings it into view. */
export async function openThreadAt(threadId: string, itemId: string, seq: number): Promise<void> {
  await openThread(threadId)
  await run((e) => e.thread.earlier, async () => {
    for (;;) {
      const t = useTimelines.getState().byThread[threadId]
      const beforeSeq = t && oldestSeq(t)
      if (!t?.hasMore || beforeSeq === undefined || beforeSeq <= seq) return
      const page = await gateway().call('thread/read', { threadId, beforeSeq, limit: PAGE_SIZE })
      update(threadId, (cur) => prependPage(cur, page))
    }
  })
  focusItem({ threadId, itemId })
}

export function loadOlder(threadId: string): Promise<void | undefined> {
  return run((e) => e.thread.earlier, async () => {
    const t = useTimelines.getState().byThread[threadId]
    const beforeSeq = t && oldestSeq(t)
    if (!t?.hasMore || beforeSeq === undefined) return
    const page = await gateway().call('thread/read', { threadId, beforeSeq, limit: PAGE_SIZE })
    update(threadId, (cur) => prependPage(cur, page))
  })
}

/** Starts a thread from the draft screen with its first message, which
 * also names it. */
export function startThread(workspaceId: string | undefined, { text, files }: Message): Promise<boolean> {
  return run((e) => e.thread.start, async () => {
    const title = titleFromMessage(text, files.map((f) => f.name))
    const { thread } = await gateway().call('thread/start', {
      workspaceId,
      // A conversation in a workspace runs in the workspace's environment;
      // outside one, in the environment chosen on the draft, or with none the
      // user's first. One that is no longer there (deleted elsewhere) is none.
      environmentId: workspaceId ? undefined : chosenEnvironment(),
      title: title || undefined,
    })
    // thread/changed has put it in the list already.
    store(thread.id, emptyTimeline(thread))
    // The policy chosen on the draft's composer, before its first turn;
    // none inherits.
    const approvalPolicy = useNavigation.getState().approval
    if (approvalPolicy) await gateway().call('thread/updatePermissions', { threadId: thread.id, approvalPolicy, permissions: {} })
    // The pages the draft opened are the thread's, before its agent acts.
    await desktop.browser.handOver(DRAFT_BROWSER, thread.id)
    const model = useNavigation.getState().model
    go({ kind: 'thread', threadId: thread.id })
    chooseModel(model)
    // The panel that stood beside the draft goes on beside its thread.
    handOverPanel(DRAFT_BROWSER, thread.id)
    await withMessageInput(text, files, (input) => startTurn(thread.id, input))
    return true
  }).then(Boolean)
}

export type SendMode = 'steer' | 'queue'

/** What the person sends: text, files, or both. */
export interface Message {
  text: string
  files: File[]
}

/** Sends a message. While a turn runs, "steer" adds it to that turn
 * (turn/steer) and "queue" makes it a new turn that starts after it; on an
 * idle thread both start a turn. A steer that loses the race with the turn
 * ending (NoActiveTurn, TurnMismatch) is sent as a new turn instead, which
 * is what the message needs. */
export function sendMessage(threadId: string, { text, files }: Message, mode: SendMode): Promise<boolean> {
  return run((e) => e.thread.send, async () => {
    await withMessageInput(text, files, async (input) => {
      const t = useTimelines.getState().byThread[threadId]
      const running = t && activeTurn(t)
      if (running && mode === 'steer') {
        try {
          await gateway().call('turn/steer', { threadId, input, expectedTurnId: running.id })
          return
        } catch (err) {
          const ended = err instanceof RpcError && (err.code === ErrorCode.noActiveTurn || err.code === ErrorCode.turnMismatch)
          if (!ended) throw err
        }
      }
      await startTurn(threadId, input)
    })
    return true
  }).then(Boolean)
}

async function startTurn(threadId: string, input: UserInput[]): Promise<void> {
  const connection = useNavigation.getState().model
  // turn/changed has put the turn in the timeline already.
  await gateway().call('turn/start', { threadId, input, connection })
}

export function interrupt(threadId: string): Promise<void | undefined> {
  return run((e) => e.thread.stop, async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running) await gateway().call('turn/interrupt', { threadId, turnId: running.id })
  })
}

/** Takes the thread's latest message back to write it again: a turn still
 * running stops, as Stop does, and the message, its text and its files,
 * goes back in the thread's box. The one that was sent stays in the
 * history; sending the box is a new message. */
export function editMessage(threadId: string, message: ItemRow): Promise<void | undefined> {
  return run((e) => e.thread.edit, async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running) await gateway().call('turn/interrupt', { threadId, turnId: running.id })
    const files = await Promise.all((message.attachments ?? []).map((a) => attachmentFile(threadId, a)))
    reopenDraft(threadId, message.text ?? '', files)
  })
}

/** Sends a failed turn's messages again as one message of a new turn: their
 * texts, one after another (the one it was sent and any sent into it while
 * it ran), and the files they went with. */
export function retryTurn(threadId: string, messages: ItemRow[]): Promise<boolean> {
  return run((e) => e.thread.send, async () => {
    const files = await Promise.all(messages.flatMap((message) => message.attachments ?? []).map((a) => attachmentFile(threadId, a)))
    const text = messages.flatMap((message) => (message.text ? [message.text] : [])).join('\n\n')
    await withMessageInput(text, files, (input) => startTurn(threadId, input))
    return true
  }).then(Boolean)
}

export function updateThreadPermissions(threadId: string, settings: PermissionSettings): Promise<boolean> {
  return run((e) => e.thread.permissions, async () => {
    // thread/changed brings the new row to the thread and the list.
    await gateway().call('thread/updatePermissions', { threadId, ...settings })
    return true
  }).then(Boolean)
}
