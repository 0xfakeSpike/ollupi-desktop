// Pulls server state into the stores: the catalog after (re)connecting, and
// thread pages on demand.

import type { OllupiClient } from '@ollupi/client'
import { refreshFromPage, timelineFromPage } from '@ollupi/core'
import { useCatalog } from '../stores/catalog'
import { useNavigation } from '../stores/navigation'
import { useTimelines } from '../stores/timelines'

const THREAD_LIST_LIMIT = 100
export const PAGE_SIZE = 100

/** Reloads everything after a (re)connect. Cached timelines other than the
 * open one are dropped; they reload when opened. */
export async function syncAll(client: OllupiClient): Promise<void> {
  const [workspaces, threads, models] = await Promise.all([
    client.call('workspace/list', {}),
    client.call('thread/list', { limit: THREAD_LIST_LIMIT }),
    client.call('model/list', {}),
  ])
  useCatalog.getState().hydrate({
    workspaces: workspaces.data,
    threads: threads.data,
    models: models.data,
    defaultModel: models.default,
  })

  const screen = useNavigation.getState().screen
  const open = screen.kind === 'thread' ? screen.threadId : undefined
  const kept = open ? useTimelines.getState().byThread[open] : undefined
  useTimelines.getState().clear()
  if (open) {
    const page = await client.call('thread/resume', { threadId: open, limit: PAGE_SIZE })
    useTimelines.getState().set(open, refreshFromPage(kept, page))
  }
}

/** Loads a thread's latest page unless it is already live. thread/resume also
 * makes the server re-send any request still waiting in that thread. */
export async function loadThread(client: OllupiClient, threadId: string): Promise<void> {
  if (useTimelines.getState().byThread[threadId]) return
  const page = await client.call('thread/resume', { threadId, limit: PAGE_SIZE })
  useTimelines.getState().set(threadId, timelineFromPage(page))
}
