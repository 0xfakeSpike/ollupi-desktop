// The time the person spent with a conversation, as the main process counted
// it: time with the window in front while someone was at the computer. The
// window says which conversation it shows, carries the writing through the
// gateway connection it already holds, and asks for the total to show; the
// main process is the one that watches the window and the idle clock.

import type { OllupiClient } from '@ollupi/client'
import { RpcError } from '@ollupi/client'
import { useEffect, useState } from 'react'
import { desktop } from '../platform/desktop'
import { gateway } from '../gateway/connection'
import type { PresenceContext } from '../../../shared/ipc'

/** How often the figure is read again while the window shows. A minute of
 * staleness is nothing beside the day the person reviews. */
const REFRESH_MS = 60_000
/** JSON-RPC's invalid params: the backend will never take these rows. */
const INVALID_PARAMS = -32602

/** Tells the main process which conversation the window shows, until it shows
 * another one, or none. */
export function usePresenceContext(context: PresenceContext | null): void {
  const threadId = context?.threadId ?? ''
  const workspaceId = context?.workspaceId ?? ''
  useEffect(() => {
    if (!threadId) {
      desktop.presence.context(null)
      return
    }
    desktop.presence.context({ threadId, workspaceId })
    return () => desktop.presence.context(null)
  }, [threadId, workspaceId])
}

/** Writes the stretches the main process decided on, and answers whether they
 * reached the backend; it keeps them until someone says they did. Started once
 * with the interface, like the other listeners: every window offers itself, and
 * a stretch the backend is told about twice is one stretch. */
export function startPresenceWriter(): void {
  desktop.presence.onRows((batch) => {
    void Promise.resolve()
      .then(() => gateway().call('presence/record', { rows: batch.rows }))
      .then(() => desktop.presence.ack({ batch: batch.id, outcome: 'wrote' }))
      .catch((error: unknown) => {
        // A batch the backend refuses as impossible to store is dropped: it
        // would never be accepted, and retrying it would hold every stretch
        // behind it back. Anything else is worth another try.
        const refused = error instanceof RpcError && error.code === INVALID_PARAMS
        desktop.presence.ack({ batch: batch.id, outcome: refused ? 'refused' : 'failed' })
      })
  })
}

/** Seconds the person spent with a thread since it started, or undefined while
 * nothing is known: no connection to ask, or no answer yet. Zero means the
 * thread is open and nobody has been at the computer with it for a whole
 * stretch. */
export function useSpent(threadId: string | undefined, since: string | undefined): number | undefined {
  const [seconds, setSeconds] = useState<number | undefined>()

  useEffect(() => {
    if (!threadId) return
    const start = since ? Date.parse(since) : Number.NaN
    const from = Number.isFinite(start) ? start : 0
    let current = true

    const ask = (): void => {
      // Offline says nothing rather than zero: the person may have spent an
      // hour here, and a 0 would erase that. The connection is read first, so
      // being offline is answered here and not as a rejected promise.
      let client: OllupiClient
      try {
        client = gateway()
      } catch {
        return
      }
      void spent(client, threadId, from)
        .then((found) => {
          if (current && found !== undefined) setSeconds(found)
        })
        .catch(() => {})
    }

    ask()
    const timer = setInterval(ask, REFRESH_MS)
    // Back from another application: the time that passed there is not this
    // thread's, but the figure may have changed before leaving.
    const shown = (): void => {
      if (document.visibilityState === 'visible') ask()
    }
    document.addEventListener('visibilitychange', shown)
    window.addEventListener('focus', shown)
    return () => {
      current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', shown)
      window.removeEventListener('focus', shown)
    }
  }, [threadId, since])

  return seconds
}

/** This thread's seconds, through the window's connection. */
async function spent(client: OllupiClient, threadId: string, from: number): Promise<number | undefined> {
  const summary = await client.call('presence/summary', {
    from: new Date(from).toISOString(),
    to: new Date().toISOString(),
    groupBy: 'thread',
  })
  return summary.data?.find((row) => row.key === threadId)?.seconds
}
