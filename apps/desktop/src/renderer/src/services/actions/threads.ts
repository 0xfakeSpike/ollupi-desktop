// User intents around threads and turns. Each reads what it needs from the
// stores, calls the gateway and records the authoritative result; streaming
// updates arrive separately through the bridge.

import { RpcError } from '@ollupi/client'
import { activeTurn, oldestSeq, prependPage, upsertTurn } from '@ollupi/core'
import { ErrorCode, type Decision, type PermissionSettings, type UserInputAnswer } from '@ollupi/protocol'
import { useCatalog } from '../../stores/catalog'
import { useNavigation } from '../../stores/navigation'
import { useRequests } from '../../stores/requests'
import { useTimelines } from '../../stores/timelines'
import { session } from '../session'
import { loadThread, PAGE_SIZE } from '../sync'
import { guard } from './guard'

export function newDraft(workspaceId?: string): void {
  useNavigation.getState().go({ kind: 'draft', workspaceId })
}

export function openThread(threadId: string): Promise<void | undefined> {
  useNavigation.getState().go({ kind: 'thread', threadId })
  return guard('Could not open the thread', () => loadThread(session.current(), threadId))
}

export function loadOlder(threadId: string): Promise<void | undefined> {
  return guard('Could not load earlier messages', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const before = t && oldestSeq(t)
    if (!t?.hasMore || before === undefined) return
    const page = await session.current().call('thread/read', { threadId, beforeSeq: before, limit: PAGE_SIZE })
    useTimelines.getState().update(threadId, (cur) => prependPage(cur, page))
  })
}

/** Starts a thread from the draft screen and sends its first message. */
export function startThread(workspaceId: string | undefined, text: string): Promise<boolean> {
  return guard('Could not start the thread', async () => {
    const client = session.current()
    const { thread } = await client.call('thread/start', workspaceId ? { workspaceId } : {})
    useCatalog.getState().upsertThread(thread, 'idle')
    useTimelines.getState().set(thread.id, { thread, turns: [], items: [], hasMore: false })
    const model = useNavigation.getState().model
    useNavigation.getState().go({ kind: 'thread', threadId: thread.id })
    useNavigation.getState().setModel(model)
    await startTurn(thread.id, text)
    return true
  }).then(Boolean)
}

export type SendMode = 'steer' | 'queue'

/** Sends a message into a thread. While a turn runs, "steer" adds it to that
 * turn and "queue" starts a new turn after it; when idle both start a turn. */
export function sendMessage(threadId: string, text: string, mode: SendMode = 'steer'): Promise<boolean> {
  return guard('Could not send the message', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running && mode === 'steer') {
      try {
        await session.current().call('turn/steer', {
          threadId,
          input: [{ type: 'text', text }],
          expectedTurnId: running.id,
        })
        return true
      } catch (err) {
        // The turn ended meanwhile: send it as a new turn instead.
        const ended = err instanceof RpcError && (err.code === ErrorCode.NoActiveTurn || err.code === ErrorCode.TurnMismatch)
        if (!ended) throw err
      }
    }
    await startTurn(threadId, text)
    return true
  }).then(Boolean)
}

async function startTurn(threadId: string, text: string): Promise<void> {
  const connection = useNavigation.getState().model
  const { turn } = await session.current().call('turn/start', {
    threadId,
    input: [{ type: 'text', text }],
    ...(connection ? { connection } : {}),
  })
  useTimelines.getState().update(threadId, (t) => upsertTurn(t, turn))
}

export function interruptTurn(threadId: string): Promise<void | undefined> {
  return guard('Could not stop the turn', async () => {
    const t = useTimelines.getState().byThread[threadId]
    const running = t && activeTurn(t)
    if (running) await session.current().call('turn/interrupt', { threadId, turnId: running.id })
  })
}

export function respondApproval(itemId: string, decision: Decision): void {
  const req = useRequests.getState().byItem[itemId]
  if (req?.kind === 'approval') req.respond(decision)
}

export function respondUserInput(itemId: string, answers: Record<string, UserInputAnswer>): void {
  const req = useRequests.getState().byItem[itemId]
  if (req?.kind === 'userInput') req.respond(answers)
}

export function updateThreadPermissions(threadId: string, settings: PermissionSettings): Promise<boolean> {
  return guard('Could not update thread permissions', async () => {
    const { thread } = await session.current().call('thread/updatePermissions', { threadId, ...settings })
    useCatalog.getState().upsertThread(thread)
    useTimelines.getState().update(threadId, (t) => ({ ...t, thread }))
    return true
  }).then(Boolean)
}
