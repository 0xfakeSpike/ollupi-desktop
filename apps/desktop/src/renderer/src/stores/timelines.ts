// Loaded thread timelines keyed by thread id. The store only holds them;
// every transformation is a @ollupi/core function passed to `update`.

import type { Timeline } from '@ollupi/core'
import { create } from 'zustand'

interface TimelineStore {
  byThread: Record<string, Timeline>
  set(threadId: string, timeline: Timeline): void
  /** Applies fn when the thread is loaded; events for unloaded threads are
   * dropped because opening a thread fetches its current state. */
  update(threadId: string, fn: (t: Timeline) => Timeline): void
  clear(): void
}

export const useTimelines = create<TimelineStore>()((set) => ({
  byThread: {},
  set: (threadId, timeline) => set((s) => ({ byThread: { ...s.byThread, [threadId]: timeline } })),
  update: (threadId, fn) =>
    set((s) => {
      const t = s.byThread[threadId]
      if (!t) return s
      const next = fn(t)
      return next === t ? s : { byThread: { ...s.byThread, [threadId]: next } }
    }),
  clear: () => set({ byThread: {} }),
}))

export function useTimeline(threadId: string | undefined): Timeline | undefined {
  return useTimelines((s) => (threadId ? s.byThread[threadId] : undefined))
}
