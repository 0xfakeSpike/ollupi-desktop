// Client-only UI state: the screen showing, the model chosen for the next
// message, and the panel a conversation shows beside it. Nothing here reaches the server until an action reads it.

import type { ApprovalPolicy } from '@ollupi/protocol'
import { create } from 'zustand'
import { DRAFT_BROWSER } from '../../../shared/ipc'

/** What a conversation shows beside it. */
export type Panel = 'browser' | 'files' | 'environment' | 'terminal' | 'tasks' | 'permissions' | 'context' | 'todos'

/** What a conversation has open beside it: its panel, and the file its Files
 * panel shows. Each conversation's own, so another one shows none of it. */
export interface PanelState {
  /** The panel beside it, if one is open. */
  panel?: Panel
  /** The file the Files panel shows, a path relative to its workspace's
   * root; undefined shows the tree. It outlives the panel, so opening the
   * Files panel again finds the file last shown. */
  file?: { workspaceId: string; path: string }
}

/** What the agent can do, from where. */
export type CapabilityTab = 'skills' | 'mcp' | 'tools'

/** The profile's own settings, one part at a time: who the window acts as
 * first; then General, with the version and the backend everything runs on.
 * The models and the usage are the platform's, each a screen of its own. */
export const settingsTabs = ['profiles', 'general', 'connection', 'redaction', 'notifications', 'appearance', 'language', 'permissions'] as const
export type SettingsTab = (typeof settingsTabs)[number]

export type Screen =
  | { kind: 'draft'; workspaceId: string | undefined }
  | { kind: 'thread'; threadId: string }
  | { kind: 'search' }
  /** found: a memory a search led to, with the scope that lists it. */
  | { kind: 'memory'; found?: { id: string; scope: string } }
  /** found: a task a search led to. */
  | { kind: 'cron'; found?: string }
  | { kind: 'capabilities'; tab: CapabilityTab }
  /** The platform's models: the operator sets them, a profile picks among them. */
  | { kind: 'models' }
  /** The tokens the models used. */
  | { kind: 'usage' }
  | { kind: 'settings'; tab: SettingsTab }

interface NavigationStore {
  screen: Screen
  /** The environment chosen in the composer, for the conversations started
   * from now on. Undefined starts one in the environment on this machine. */
  environment: string | undefined
  /** The connection chosen in the composer. Undefined sends none, and the
   * server continues with the thread's last model, or the default. */
  model: string | undefined
  /** The approval policy a new conversation starts with, chosen in the
   * draft's composer. Undefined starts it inheriting its workspace's, or
   * the agent's. */
  approval: ApprovalPolicy | undefined
  /** What each conversation has open beside it, by the conversation that
   * opened it: a thread's id, or a draft's place. The conversation on screen
   * shows its own; another one's stays shut until it is back. */
  panels: Record<string, PanelState>
  /** An item to bring into view once its thread shows it, e.g. a message
   * a search found. */
  focus: { threadId: string; itemId: string } | undefined
}

/** Where a reload was, so it comes back there: the conversation that was on
 * screen. sessionStorage keeps it across a reload and loses it with the
 * window, so a fresh launch still starts on a new conversation. */
const OPEN_KEY = 'ollupi.openThread'

export const useNavigation = create<NavigationStore>()(() => ({
  screen: { kind: 'draft', workspaceId: undefined },
  environment: undefined,
  model: undefined,
  approval: undefined,
  panels: {},
  focus: undefined,
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
    // Kept while the person stays on new conversations, e.g. picking a workspace.
    approval: s.screen.kind === 'draft' && screen.kind === 'draft' ? s.approval : undefined,
  }))
}

/** The conversation a screen keeps its panels by: a thread's id, or the
 * draft's place while its pages are still the draft's. Undefined for a screen
 * with no conversation of its own beside it, which shows no panel. */
function panelScope(screen: Screen): string | undefined {
  return screen.kind === 'thread' ? screen.threadId : screen.kind === 'draft' ? DRAFT_BROWSER : undefined
}

/** Opens a panel beside the conversation on screen, leaving it open when it
 * already is. */
export function openPanel(panel: Panel): void {
  useNavigation.setState((s) => {
    const scope = panelScope(s.screen)
    if (scope === undefined) return s
    const open = s.panels[scope]
    if (open?.panel === panel) return s
    return { panels: { ...s.panels, [scope]: { ...open, panel } } }
  })
}

/** Shows the panel, or closes it when it is the one showing. The file it
 * showed stays, so opening it again finds that file. */
export function togglePanel(panel: Panel): void {
  useNavigation.setState((s) => {
    const scope = panelScope(s.screen)
    if (scope === undefined) return s
    const open = s.panels[scope]
    if (open?.panel !== panel) return { panels: { ...s.panels, [scope]: { ...open, panel } } }
    const closed: PanelState = { ...open }
    delete closed.panel
    const panels = { ...s.panels }
    if (closed.file === undefined) delete panels[scope]
    else panels[scope] = closed
    return { panels }
  })
}

/** The panel to show beside the conversation on screen: the one it opened,
 * never another conversation's. */
export function shownPanel(s: Pick<NavigationStore, 'screen' | 'panels'>): Panel | undefined {
  const scope = panelScope(s.screen)
  return scope === undefined ? undefined : s.panels[scope]?.panel
}

export function usePanel(): Panel | undefined {
  return useNavigation(shownPanel)
}

/** The file the conversation on screen shows in its Files panel, if any. */
export function shownFile(s: Pick<NavigationStore, 'screen' | 'panels'>): PanelState['file'] {
  const scope = panelScope(s.screen)
  return scope === undefined ? undefined : s.panels[scope]?.file
}

export function usePanelFile(): PanelState['file'] {
  return useNavigation(shownFile)
}

/** A draft's open panel goes on beside the thread its pages became. */
export function handOverPanel(from: string, to: string): void {
  useNavigation.setState((s) => {
    const open = s.panels[from]
    if (!open) return s
    const panels = { ...s.panels, [to]: open }
    delete panels[from]
    return { panels }
  })
}

/** A thread that went away leaves no panel behind. */
export function forgetPanel(threadId: string): void {
  useNavigation.setState((s) => {
    if (s.panels[threadId] === undefined) return s
    const panels = { ...s.panels }
    delete panels[threadId]
    return { panels }
  })
}

/** Shows a workspace's file in the Files panel, opening it; undefined goes
 * back to the tree. */
export function showFile(workspaceId: string, path: string | undefined): void {
  useNavigation.setState((s) => {
    const scope = panelScope(s.screen)
    if (scope === undefined) return s
    const open = s.panels[scope]
    return { panels: { ...s.panels, [scope]: { ...open, panel: 'files', file: path === undefined ? undefined : { workspaceId, path } } } }
  })
}

export function focusItem(focus: NavigationStore['focus']): void {
  useNavigation.setState({ focus })
}

/** Drops everything that belonged to the profile the window was showing.
 * The next profile starts on a new conversation with no panels, model,
 * environment or approval inherited from the last one. */
export function resetForProfile(): void {
  sessionStorage.removeItem(OPEN_KEY)
  useNavigation.setState((s) => ({
    // Switched from the settings, the window stays there: they are no
    // conversation's, and the profiles listed say which is now in use.
    screen: s.screen.kind === 'settings' ? s.screen : { kind: 'draft', workspaceId: undefined },
    environment: undefined,
    model: undefined,
    approval: undefined,
    panels: {},
    focus: undefined,
  }))
}

export function chooseModel(model: string | undefined): void {
  useNavigation.setState({ model })
}

export function chooseApproval(approval: ApprovalPolicy | undefined): void {
  useNavigation.setState({ approval })
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
  useNavigation.setState((s) => (s.screen.kind === 'thread' && s.screen.threadId === thread ? { panels: { ...s.panels, [thread]: { ...s.panels[thread], panel: 'browser' } } } : s))
}
