// Client-only UI state: the screen showing and the model chosen for the
// next message. Nothing here reaches the server until an action reads it.

import { create } from 'zustand'

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'memory' }
  | { kind: 'settings' }

interface NavigationStore {
  screen: Screen
  /** The connection chosen in the composer. Undefined sends none, and the
   * server continues with the thread's last model, or the default. */
  model: string | undefined
}

export const useNavigation = create<NavigationStore>()(() => ({
  screen: { kind: 'draft', workspaceId: undefined },
  model: undefined,
}))

/** A model choice belongs to the conversation it was made in. */
export function go(screen: Screen): void {
  useNavigation.setState((s) => ({ screen, model: sameThread(s.screen, screen) ? s.model : undefined }))
}

export function chooseModel(model: string | undefined): void {
  useNavigation.setState({ model })
}

function sameThread(a: Screen, b: Screen): boolean {
  return a.kind === 'thread' && b.kind === 'thread' && a.threadId === b.threadId
}

export function useOpenThreadId(): string | undefined {
  return useNavigation((s) => (s.screen.kind === 'thread' ? s.screen.threadId : undefined))
}

export function openThreadId(): string | undefined {
  const s = useNavigation.getState().screen
  return s.kind === 'thread' ? s.threadId : undefined
}
