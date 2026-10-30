// Client-only UI state: the screen showing, the model chosen for the next
// message, and the panel a conversation shows beside it. Nothing here reaches the server until an action reads it.

import { create } from 'zustand'

/** What a conversation shows beside it. */
export type Panel = 'browser' | 'files' | 'changes' | 'terminal' | 'tasks' | 'permissions' | 'context'

/** What the agent can do, from where. */
export type CapabilityTab = 'skills' | 'mcp' | 'tools'
export type SettingsTab = 'general' | 'models'

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'search' }
  /** found: a memory a search led to, with the scope that lists it. */
  | { kind: 'memory'; found?: { id: string; scope: string } }
  /** found: a task a search led to. */
  | { kind: 'cron'; found?: string }
  | { kind: 'capabilities'; tab: CapabilityTab }
  | { kind: 'settings'; tab: SettingsTab }

interface NavigationStore {
  screen: Screen
  /** The connection chosen in the composer. Undefined sends none, and the
   * server continues with the thread's last model, or the default. */
  model: string | undefined
  /** Stays open across threads, like a pane. */
  panel: Panel | undefined
  /** Where settings goes back to: the screen open before them. */
  beforeSettings: Screen
  /** An item to bring into view once its thread shows it, e.g. a message
   * a search found. */
  focus: { threadId: string; itemId: string } | undefined
  /** The file the Files panel shows, a path relative to its workspace's
   * root; undefined shows the tree. */
  file: { workspaceId: string; path: string } | undefined
}

export const useNavigation = create<NavigationStore>()(() => ({
  screen: { kind: 'draft', workspaceId: undefined },
  model: undefined,
  panel: undefined,
  beforeSettings: { kind: 'draft', workspaceId: undefined },
  focus: undefined,
  file: undefined,
}))

/** A model choice belongs to the conversation it was made in. */
export function go(screen: Screen): void {
  useNavigation.setState((s) => ({
    screen,
    model: sameThread(s.screen, screen) ? s.model : undefined,
    beforeSettings: screen.kind === 'settings' && s.screen.kind !== 'settings' ? s.screen : s.beforeSettings,
  }))
}

/** Leaves settings for the screen open before them. */
export function leaveSettings(): void {
  go(useNavigation.getState().beforeSettings)
}

/** Shows the panel, or closes it when it is the one showing. */
export function togglePanel(panel: Panel): void {
  useNavigation.setState((s) => ({ panel: s.panel === panel ? undefined : panel }))
}

/** Shows a workspace's file in the Files panel, opening it; undefined goes
 * back to the tree. */
export function showFile(workspaceId: string, path: string | undefined): void {
  useNavigation.setState(path === undefined ? { file: undefined } : { panel: 'files', file: { workspaceId, path } })
}

export function focusItem(focus: NavigationStore['focus']): void {
  useNavigation.setState({ focus })
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

/** A thread's agent acted in its browser tab: that conversation, if it is
 * on screen, shows it, so the person sees what it does. */
export function showBrowser(thread: string): void {
  useNavigation.setState((s) => (s.screen.kind === 'thread' && s.screen.threadId === thread ? { panel: 'browser' } : s))
}
