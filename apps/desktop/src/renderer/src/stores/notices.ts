// Transient messages shown as toasts (failed actions, gateway errors).

import { create } from 'zustand'

export interface Notice {
  id: number
  tone: 'info' | 'danger'
  message: string
}

interface NoticeStore {
  notices: Notice[]
  push(message: string, tone?: Notice['tone']): void
  dismiss(id: number): void
}

let nextId = 1
const TTL_MS = 6000

export const useNotices = create<NoticeStore>()((set, get) => ({
  notices: [],
  push: (message, tone = 'danger') => {
    const id = nextId++
    set((s) => ({ notices: [...s.notices.slice(-3), { id, tone, message }] }))
    setTimeout(() => get().dismiss(id), TTL_MS)
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

export const notify = (message: string, tone?: Notice['tone']) => useNotices.getState().push(message, tone)
