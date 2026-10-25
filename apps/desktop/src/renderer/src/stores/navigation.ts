// Client-only UI state: which screen is showing and what the composer will
// use for the next message. Nothing here is sent to the server until an
// action reads it.

import { create } from 'zustand'

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'memory' }
  | { kind: 'settings' }

interface NavigationStore {
  screen: Screen
  /** Model chosen in the composer; undefined follows the thread's last model. */
  model: string | undefined
  go(screen: Screen): void
  setModel(model: string | undefined): void
}

export const useNavigation = create<NavigationStore>()((set) => ({
  screen: { kind: 'draft', workspaceId: undefined },
  model: undefined,
  go: (screen) => set((s) => ({ screen, model: sameThread(s.screen, screen) ? s.model : undefined })),
  setModel: (model) => set({ model }),
}))

function sameThread(a: Screen, b: Screen): boolean {
  return a.kind === 'thread' && b.kind === 'thread' && a.threadId === b.threadId
}

export function useActiveThreadId(): string | undefined {
  return useNavigation((s) => (s.screen.kind === 'thread' ? s.screen.threadId : undefined))
}
