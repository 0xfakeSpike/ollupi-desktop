// Routes everything the gateway pushes into the stores: notifications become
// store updates, server requests become pending requests the user answers.
// This is the only place that knows both the client's events and the stores.

import type { OllupiClient } from '@ollupi/client'
import { appendDelta, setThread, upsertItem, upsertTurn } from '@ollupi/core'
import type { TurnNotification } from '@ollupi/protocol'
import { useCatalog } from '../stores/catalog'
import { notify } from '../stores/notices'
import { useRequests } from '../stores/requests'
import { useTimelines } from '../stores/timelines'

export function bindClient(client: OllupiClient): () => void {
  const timelines = () => useTimelines.getState()
  const catalog = () => useCatalog.getState()
  const requests = () => useRequests.getState()

  // Turn events carry the thread as the server stored it, so the sidebar's
  // title and order come straight from the server.
  const onTurn = ({ threadId, thread, turn }: TurnNotification) => {
    timelines().update(threadId, (t) => upsertTurn(setThread(t, thread), turn))
    catalog().upsertThread(thread)
  }

  const offs = [
    client.on('thread/started', ({ thread }) => catalog().upsertThread(thread)),
    client.on('thread/status/changed', ({ threadId, status }) => catalog().setThreadStatus(threadId, status)),
    client.on('turn/queued', onTurn),
    client.on('turn/started', onTurn),
    client.on('turn/completed', onTurn),
    client.on('item/started', ({ threadId, item }) => timelines().update(threadId, (t) => upsertItem(t, item))),
    client.on('item/completed', ({ threadId, item }) => {
      timelines().update(threadId, (t) => upsertItem(t, item))
      requests().remove(item.id)
    }),
    client.on('item/agentMessage/delta', ({ threadId, itemId, delta }) =>
      timelines().update(threadId, (t) => appendDelta(t, itemId, delta)),
    ),
    client.on('item/reasoning/textDelta', ({ threadId, itemId, delta }) =>
      timelines().update(threadId, (t) => appendDelta(t, itemId, delta)),
    ),
    client.on('workspace/changed', ({ workspace }) => catalog().upsertWorkspace(workspace)),
    client.on('error', ({ message }) => notify(message)),

    client.handle(
      'item/toolCall/requestApproval',
      (params) =>
        new Promise((resolve) =>
          requests().add({
            kind: 'approval',
            params,
            respond: (decision) => {
              requests().remove(params.itemId)
              resolve({ decision })
            },
          }),
        ),
    ),
    client.handle(
      'item/tool/requestUserInput',
      (params) =>
        new Promise((resolve) =>
          requests().add({
            kind: 'userInput',
            params,
            respond: (answers) => {
              requests().remove(params.itemId)
              resolve({ answers })
            },
          }),
        ),
    ),
  ]
  return () => offs.forEach((off) => off())
}
