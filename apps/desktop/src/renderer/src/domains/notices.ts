// Transient messages shown as toasts: failed actions and gateway errors.
// Info clears itself; an error stays until it is dismissed.

import { create } from 'zustand'

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
const MAX_SHOWN = 3
let nextId = 1

export const useNotices = create<NoticeStore>()((set) => ({
  notices: [],
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

export function notify(message: string, tone: Notice['tone'] = 'danger'): void {
  const id = nextId++
  useNotices.setState((s) => ({ notices: [...s.notices.slice(-(MAX_SHOWN - 1)), { id, tone, message }] }))
  if (tone === 'info') setTimeout(() => useNotices.getState().dismiss(id), INFO_TTL_MS)
}
