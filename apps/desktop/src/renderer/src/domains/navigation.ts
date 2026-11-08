// Client-only UI state: the screen showing, the model chosen for the next
// message, and the panel a conversation shows beside it. Nothing here reaches the server until an action reads it.

import { create } from 'zustand'

/** What a conversation shows beside it. */
export type Panel = 'browser' | 'files' | 'changes' | 'terminal' | 'tasks' | 'permissions' | 'context'

/** What the agent can do, from where. */
export type CapabilityTab = 'skills' | 'mcp' | 'tools'

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'search' }
  /** found: a memory a search led to, with the scope that lists it. */
  | { kind: 'memory'; found?: { id: string; scope: string } }
  /** found: a task a search led to. */
  | { kind: 'cron'; found?: string }
  | { kind: 'capabilities'; tab: CapabilityTab }
  | { kind: 'settings' }

interface NavigationStore {
  screen: Screen
  /** The environment chosen in the composer, for the conversations started
   * from now on. Undefined starts one in the environment on this machine. */
  environment: string | undefined
  /** The connection chosen in the composer. Undefined sends none, and the
   * server continues with the thread's last model, or the default. */
  model: string | undefined
  /** Stays open across threads, like a pane. */
  panel: Panel | undefined
  /** An item to bring into view once its thread shows it, e.g. a message
   * a search found. */
  focus: { threadId: string; itemId: string } | undefined
  /** The file the Files panel shows, a path relative to its workspace's
   * root; undefined shows the tree. */
  file: { workspaceId: string; path: string } | undefined
}

/** Where a reload was, so it comes back there: the conversation that was on
 * screen. sessionStorage keeps it across a reload and loses it with the
 * window, so a fresh launch still starts on a new conversation. */
const OPEN_KEY = 'ollupi.openThread'

export const useNavigation = create<NavigationStore>()(() => ({
  screen: { kind: 'draft', workspaceId: undefined },
  environment: undefined,
  model: undefined,
  panel: undefined,
  focus: undefined,
  file: undefined,
}))

/** Puts back the conversation the window showed before a reload, for the
 * session's first sync to read. Called once when the window loads. */
export function startNavigation(): void {
  const threadId = sessionStorage.getItem(OPEN_KEY)
  if (threadId) useNavigation.setState({ screen: { kind: 'thread', threadId } })
}

/** Shows a screen, and remembers a conversation for a reload. A model choice
 * belongs to the conversation it was made in. */
export function go(screen: Screen): void {
  if (screen.kind === 'thread') sessionStorage.setItem(OPEN_KEY, screen.threadId)
  else sessionStorage.removeItem(OPEN_KEY)
  useNavigation.setState((s) => ({
    screen,
    model: sameThread(s.screen, screen) ? s.model : undefined,
  }))
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

/** Where the conversations started from now on run. A thread keeps the
 * environment it began in, so this is read when one starts, not after. */
export function chooseEnvironment(environment: string | undefined): void {
  useNavigation.setState({ environment })
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
