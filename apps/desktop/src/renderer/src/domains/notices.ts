// Transient messages shown as toasts: failed actions and gateway errors.

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

const TTL_MS = 6000
let nextId = 1

export const useNotices = create<NoticeStore>()((set) => ({
  notices: [],
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

export function notify(message: string, tone: Notice['tone'] = 'danger'): void {
  const id = nextId++
  useNotices.setState((s) => ({ notices: [...s.notices.slice(-3), { id, tone, message }] }))
  setTimeout(() => useNotices.getState().dismiss(id), TTL_MS)
}
