// Client-only UI state: the screen showing, the model chosen for the next
// message, and the panel a conversation shows beside it. Nothing here reaches the server until an action reads it.

import { create } from 'zustand'

/** What a conversation shows beside it. */
export type Panel = 'files' | 'tasks' | 'permissions' | 'context'

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'memory' }
  | { kind: 'skills' }
  | { kind: 'cron' }
  | { kind: 'settings' }

interface NavigationStore {
  screen: Screen
  /** The connection chosen in the composer. Undefined sends none, and the
   * server continues with the thread's last model, or the default. */
  model: string | undefined
  /** Stays open across threads, like a pane. */
  panel: Panel | undefined
}

export const useNavigation = create<NavigationStore>()(() => ({
  screen: { kind: 'draft', workspaceId: undefined },
  model: undefined,
  panel: undefined,
}))

/** A model choice belongs to the conversation it was made in. */
export function go(screen: Screen): void {
  useNavigation.setState((s) => ({ screen, model: sameThread(s.screen, screen) ? s.model : undefined }))
}

/** Shows the panel, or closes it when it is the one showing. */
export function togglePanel(panel: Panel): void {
  useNavigation.setState((s) => ({ panel: s.panel === panel ? undefined : panel }))
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
