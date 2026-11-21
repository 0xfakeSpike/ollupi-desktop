// Transient messages shown as toasts: failed actions and gateway errors.
// Info clears itself quickly; an error stays long enough to be read, then
// clears too, or earlier when it is dismissed.

import { create } from 'zustand'
import type { Domain } from '../gateway/domain'

export interface Notice {
  id: number
  tone: 'info' | 'danger'
  message: string
}

interface NoticeStore {
  notices: Notice[]
  dismiss(id: number): void
}

const INFO_TTL_MS = 4000
const ERROR_TTL_MS = 60_000
const MAX_SHOWN = 3
let nextId = 1

export const useNotices = create<NoticeStore>()((set) => ({
  notices: [],
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

export function notify(message: string, tone: Notice['tone'] = 'danger'): number {
  const id = nextId++
  useNotices.setState((s) => ({ notices: [...s.notices.slice(-(MAX_SHOWN - 1)), { id, tone, message }] }))
  setTimeout(() => useNotices.getState().dismiss(id), tone === 'info' ? INFO_TTL_MS : ERROR_TTL_MS)
  return id
}

/** An answer to a request that the gateway refuses comes with no call to
 * fail: it names the request's item. A turn's own failure, which names no
 * item, shows in its timeline. */
export const noticesDomain: Domain = {
  bind: (client) =>
    client.on('error', ({ itemId, message }) => {
      if (itemId) notify(message)
    }),
}
