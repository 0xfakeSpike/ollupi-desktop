// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

import type { SkillFolder } from './generated/backend-skills'
import type { AgentRole, PresenceInput } from '@ollupi/protocol'

/** The backend process as the supervisor sees it. */
export type BackendState =
  | { status: 'starting' }
  /** profile is the one the token names, which the window acts as. */
  | { status: 'ready'; url: string; token: string; profile: string; version: string }
  | { status: 'failed'; failure: BackendFailure; log: string }
  | { status: 'stopped' }

/** Why the backend is not running. The renderer words it in the app's
 * language; only what ollupi itself reported (reported.message) is shown
 * as written. */
export type BackendFailure =
  | { kind: 'timeout'; seconds: number }
  | { kind: 'spawn'; binary: string; error: string }
  | { kind: 'exited'; how: string }
  | { kind: 'reported'; message: string | undefined }
  /** The remote ollupid's door said no: Cloudflare Access refused the
   * service token, the gateway refused the token, or the gateway refused the
   * Host header cloudflared sent. */
  | { kind: 'remote'; refused: RemoteRefusal; url: string }

export const remoteRefusals = ['access', 'token', 'host'] as const
export type RemoteRefusal = (typeof remoteRefusals)[number]

/** The remote ollupid the window connects to instead of the one this Mac
 * runs. The secrets never come back to the renderer: only whether they are
 * kept. */
export interface RemoteSettings {
  enabled: boolean
  /** wss://host/, or ws:// on a loopback address (an SSH tunnel). */
  url: string
  accessClientId: string
  hasToken: boolean
  hasAccessSecret: boolean
}

/** What the person saves. An empty token or Access secret keeps the one
 * already kept. */
export interface RemoteInput {
  enabled: boolean
  url: string
  token: string
  accessClientId: string
  accessClientSecret: string
}

export interface AppInfo {
  version: string
  platform: string
  /** The backend's data directory. */
  home: string
  /** The backend's log file. */
  backendLog: string
  /** The user's home folder, which paths shown to them start from as ~. */
  userHome: string
}

/** The API a provider of the catalog speaks, which picks the backend's
 * client for it, and how this app lists the provider's models. */
export const apiTypes = ['openai', 'anthropic', 'gemini'] as const
export type ApiType = (typeof apiTypes)[number]

/** A profile: a user of ollupi's store, its id the one a token names and
 * its name the one people see it by, empty until someone names it. */
export interface Profile {
  id: string
  name: string
}

/** One model an API lists, with those of its limits the API says. */
export interface ListedModel {
  name: string
  limits?: { context?: number; input?: number; output?: number }
}

/** The models a provider's API lists, or why it could not be asked. */
export type ModelList = { ok: true; models: ListedModel[] } | { ok: false; error: string }

/** A skill folder read for import (ollupid --read-skill): its fields as
 * skill/set takes them, without the agents that have it, and the files
 * ollupi keeps none of; or why it cannot be read. */
export type { SkillFolder }
/** An agent a skill is given to, as the app offers it: the main agent, which
 * ollupi runs as one of two roles by the size of the model (a skill of its
 * is given to both, so a conversation that changes model keeps it), the
 * Super Agent (the hub's role), or one kind of subagent. */
export type SkillAgent = 'main' | 'hub-main-agent' | 'general-sub-agent' | 'browser-sub-agent' | 'design-sub-agent' | 'codebase-sub-agent' | 'frontend-sub-agent' | 'backend-sub-agent' | 'writing-sub-agent' | 'research-sub-agent'
export const skillAgents: readonly SkillAgent[] = ['main', 'hub-main-agent', 'general-sub-agent', 'browser-sub-agent', 'design-sub-agent', 'codebase-sub-agent', 'frontend-sub-agent', 'backend-sub-agent', 'writing-sub-agent', 'research-sub-agent']
/** The roles ollupi gives an agent's skill to. */
export function rolesOf(agent: SkillAgent): AgentRole[] {
  return agent === 'main' ? ['full-main-agent', 'compact-main-agent'] : [agent]
}
/** The agents that have a skill given to these roles: the main agent has
 * one given to either of its roles. */
export function agentsOf(roles: readonly string[]): SkillAgent[] {
  return skillAgents.filter((agent) => rolesOf(agent).some((role) => roles.includes(role)))
}


/** One of a thread's browser tabs; id is its page's. */
export interface BrowserTab {
  id: number
  url: string
  title: string
  loading: boolean
}

/** A file a page saved: its name as the page gave it, and where it went;
 * path is undefined when the download did not finish. */
export interface BrowserDownload {
  name: string
  path?: string
}

/** A page asking to use something of the Mac, as the panel shows it. */
export interface BrowserPermission {
  /** Names the question while it is open. */
  id: number
  /** The site asking it, by its host. */
  host: string
  /** Electron's name for what it asks: 'notifications', 'geolocation'… */
  permission: string
  /** Whether the person's answer is kept for the site, or asked again by the
   * next page that wants it. */
  keep: boolean
}

/** A thread's browser tabs as its panel shows them, and the active one's
 * page; an empty page when there is none. */
export interface BrowserState {
  tabs: BrowserTab[]
  active: number | undefined
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** A provider account's balance, in each currency it holds. */
export interface Balance {
  amounts: { currency: string; amount: number }[]
}

/** A page the person keeps in the browser. */
export interface Bookmark {
  url: string
  title: string
}

/** A Chrome profile's bookmarks, each with the folders it is in. */
export interface ChromeBookmarks {
  profile: string
  bookmarks: (Bookmark & { folder: string })[]
}

export interface BookmarkList {
  own: Bookmark[]
  chrome: ChromeBookmarks[]
}

/** A page the browser opened: how often, and when last. */
export interface Visit {
  url: string
  title: string
  visits: number
  last: number
}

/** What the address bar offers for query: visited and bookmarked pages,
 * best first, and how it completes what is typed, if it does. */
export interface Suggestions {
  query: string
  items: { url: string; title: string; bookmarked: boolean }[]
  /** text completes what is typed, and url is the page it opens. */
  inline?: { text: string; url: string }
}

/** Where the browser panel shows the page, in the window's content. */
export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

/** The tool provider the app's browser is in the backend, whose tools are
 * browser_<action>; no MCP server can take the name. */
export const BROWSER_PROVIDER = 'browser'

/** Whose tabs a draft's browser panel shows, as a thread's are by its id:
 * the draft's thread takes them when it starts. */
export const DRAFT_BROWSER = 'draft'

/** The app's own updates, from its GitHub releases. unsupported is a build
 * not running from an installed .app (development). A downloaded update is
 * ready: it is installed when the app quits. */
export type UpdateState =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'checking' }
  /** current is the running version, which no release is newer than. */
  | { status: 'latest'; current: string }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; received: number; total: number }
  | { status: 'ready'; version: string }
  /** version is the release that failed to download; undefined when the
   * check failed. */
  | { status: 'failed'; version: string | undefined; failure: UpdateFailure }

/** The app's GitHub releases, which it updates from. */
export const RELEASES_URL = 'https://github.com/0xfakeSpike/ollupi-desktop/releases'

/** Its release list. A check the person asks for reads this, because
 * /releases/latest never names a prerelease: betas stay out of the automatic
 * checks and appear only when someone looks. */
export const RELEASES_API = 'https://api.github.com/repos/0xfakeSpike/ollupi-desktop/releases?per_page=30'

/** Why an update failed. location: the app's folder cannot be written, so
 * the app cannot be replaced where it is (e.g. run from the dmg). */
export type UpdateFailure = { kind: 'location'; path: string } | { kind: 'error'; message: string }

/** Light or dark, or whichever the system uses. */
export type ColorScheme = 'system' | 'light' | 'dark'
export const colorSchemes: readonly ColorScheme[] = ['system', 'light', 'dark']

/** The interface's themes (packages/ui/src/theme.css): stone and moss, the
 * default, and dusk. */
export type AppTheme = 'stone' | 'dusk'
export const appThemes: readonly AppTheme[] = ['stone', 'dusk']

/** A system notification about a thread; clicking it opens the thread. */
export interface ThreadNotice {
  threadId: string
  title: string
  body: string
}

/** What the window shows, as the presence recorder needs it: the conversation
 * on screen and the workspace it belongs to. */
export interface PresenceContext {
  threadId: string
  workspaceId: string
}

/** Stretches the main process decided on, handed to a window to write. The
 * window already holds the one gateway connection, and the backend takes a row
 * twice without harm, so every window gets the batch and the first answer is
 * enough. */
export interface PresenceBatch {
  id: string
  rows: PresenceInput[]
}

/** A window's answer to one batch: the rows reached the backend, or it refused
 * them as impossible to store, or the window could not reach it at all. */
export interface PresenceAck {
  batch: string
  outcome: 'wrote' | 'refused' | 'failed'
}

export interface DesktopApi {
  info(): Promise<AppInfo>
  backend: {
    state(): Promise<BackendState>
    restart(): Promise<void>
    /** After a connection to a remote ollupid fails: asks it why, and turns
     * a refusal into a failed state. Nothing for the backend this Mac runs. */
    check(): Promise<void>
    onState(listener: (state: BackendState) => void): () => void
  }
  /** Connecting to an ollupid on another machine instead of running one. */
  remote: {
    read(): Promise<RemoteSettings>
    /** Keeps the settings, reconnects and reloads the window, whose CSP
     * names the remote host. */
    save(input: RemoteInput): Promise<void>
  }
  /** Skills are each profile's, in the store, over the gateway; a folder
   * on this Mac is read here for import. */
  skills: {
    /** Asks for a skill folder and reads it; undefined when none was chosen. */
    import(): Promise<SkillFolder | undefined>
  }
  /** The profile the window acts as. A connection is always one: there is
   * no anonymous one to fall back to. The profiles themselves are ollupi's
   * users, which the operator lists, makes and names over the gateway. */
  profile: {
    /** Deletes a non-current profile: its data in the store and its files.
     * The backend stops while the store changes; it refuses the last. */
    delete(id: string): Promise<void>
    /** Makes a profile the window's: its connection reconnects as it, and a
     * restart opens as it. */
    select(id: string): Promise<void>
  }
  /** The app's browser: each thread's tabs, which the person and that
   * thread's agent share. The agent acts in the active one; open, back,
   * forward and reload act in it too. */
  browser: {
    state(thread: string): Promise<BrowserState>
    /** Shows the thread's active tab over the panel's area; undefined hides
     * it. */
    place(thread: string, bounds: BrowserBounds | undefined): Promise<void>
    /** Opens what the person typed in the active tab: an address, or a
     * Google search for anything else. */
    open(thread: string, url: string): Promise<void>
    /** Opens the start page in a new tab after the active one, made
     * active. */
    newTab(thread: string): Promise<void>
    /** The browser opened: a thread with no tab yet opens the start page. */
    start(thread: string): Promise<void>
    selectTab(thread: string, id: number): Promise<void>
    closeTab(thread: string, id: number): Promise<void>
    /** Closes the thread's tabs and forgets them: it was archived or
     * deleted, and its pages would only keep the window's memory. */
    forget(thread: string): Promise<void>
    /** Gives a draft's tabs to the thread it started. */
    handOver(from: string, to: string): Promise<void>
    /** The person's bookmarks, and Chrome's to open; add and remove change
     * the person's and answer with them. */
    bookmarks: {
      list(): Promise<BookmarkList>
      add(url: string, title: string): Promise<Bookmark[]>
      remove(url: string): Promise<Bookmark[]>
    }
    /** The pages the browser has opened, by the person or an agent. */
    history: {
      count(): Promise<number>
      /** The pages matching filter, the most lately opened first. */
      list(filter: string): Promise<Visit[]>
      remove(url: string): Promise<void>
      clear(): Promise<void>
    }
    /** What the address bar offers for what is typed. */
    suggest(query: string): Promise<Suggestions>
    back(thread: string): Promise<void>
    forward(thread: string): Promise<void>
    reload(thread: string): Promise<void>
    onState(listener: (thread: string, state: BrowserState) => void): () => void
    /** The thread's agent acted in its tab. */
    onUsed(listener: (thread: string) => void): () => void
    /** A page's download ended, saved or not. */
    onDownloaded(listener: (thread: string, download: BrowserDownload) => void): () => void
    /** A page asked to use something of the Mac; the person answers it in the
     * panel, and the page waits for that answer. */
    onPermissionAsked(listener: (thread: string, permission: BrowserPermission) => void): () => void
    /** The person's answer to the question that id names. */
    answerPermission(id: number, allow: boolean): Promise<void>
    /** The question that id names was withdrawn unanswered, so the panel takes
     * it away: it waited a minute, or its conversation closed. */
    onPermissionClosed(listener: (thread: string, id: number) => void): () => void
  }
  /** Asks a provider's API which models it serves. The main process asks,
   * as the API would not answer the renderer's origin. An empty base URL is
   * the API's own, as for the backend. */
  listModels(type: ApiType, baseUrl: string, apiKey: string): Promise<ModelList>
  /** What the provider's account has left, when its API tells the key;
   * undefined for any other provider or when the request fails. */
  balance(baseUrl: string, apiKey: string): Promise<Balance | undefined>
  /** The app checks for a newer release itself; downloading one waits for
   * the person to agree. */
  update: {
    state(): Promise<UpdateState>
    check(): Promise<void>
    download(): Promise<void>
    /** Quits, installs the downloaded update and reopens the app. */
    restart(): Promise<void>
    onState(listener: (state: UpdateState) => void): () => void
  }
  /** Shows a system notification, only while no window of the app is in
   * front: the person is looking elsewhere. */
  notify(notice: ThreadNotice): Promise<void>
  /** The person clicked a notification; the window is already in front. */
  onNoticeClicked(listener: (threadId: string) => void): () => void
  /** The Dock's badge: how many threads wait on the person; 0 clears it. */
  setBadge(count: number): Promise<void>
  /** Time the person spent with each conversation, kept in the local backend's
   * database. The main process watches the window and the machine's idle clock
   * itself; the renderer only says which conversation is on screen. */
  presence: {
    /** The conversation the window shows; null when it shows none. */
    context(context: PresenceContext | null): void
    /** Stretches to write through this window's connection; answer with
     * `ack`, and the main process keeps them until someone does. */
    onRows(listener: (batch: PresenceBatch) => void): () => void
    ack(ack: PresenceAck): void
  }
  /** Asks where to save text, suggesting a file name in Documents, and
   * writes it there; undefined when the person cancelled. */
  saveFile(name: string, text: string): Promise<string | undefined>
  openPath(path: string): Promise<void>
  /** Shows a file in Finder, selected. */
  revealFile(path: string): Promise<void>
  /** A native menu at the pointer; resolves to the chosen item's id, or
   * undefined when it closed without a choice. */
  contextMenu(items: ContextMenuItem[]): Promise<string | undefined>
  /** Sets the window's scheme, which the renderer's prefers-color-scheme
   * and the native window chrome both follow. */
  setColorScheme(scheme: ColorScheme): Promise<void>
  /** Shows the theme's icon in the Dock while the app runs. */
  setAppIcon(theme: AppTheme): Promise<void>
}

/** One entry of a context menu, named by the renderer in its language. */
export interface ContextMenuItem {
  id: string
  label: string
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  BackendCheck: 'backend:check',
  RemoteRead: 'remote:read',
  RemoteSave: 'remote:save',
  SkillsImport: 'skills:import',
  ProfileDelete: 'profile:delete',
  ProfileSelect: 'profile:select',
  BrowserState: 'browser:state',
  BrowserPlace: 'browser:place',
  BrowserOpen: 'browser:open',
  BrowserNewTab: 'browser:newTab',
  BrowserStart: 'browser:start',
  BrowserSelectTab: 'browser:selectTab',
  BrowserCloseTab: 'browser:closeTab',
  BrowserForget: 'browser:forget',
  BrowserHandOver: 'browser:handOver',
  BookmarksList: 'bookmarks:list',
  BookmarksAdd: 'bookmarks:add',
  BookmarksRemove: 'bookmarks:remove',
  HistoryCount: 'history:count',
  HistoryList: 'history:list',
  HistoryRemove: 'history:remove',
  HistoryClear: 'history:clear',
  BrowserSuggest: 'browser:suggest',
  BrowserBack: 'browser:back',
  BrowserForward: 'browser:forward',
  BrowserReload: 'browser:reload',
  BrowserChanged: 'browser:changed',
  BrowserUsed: 'browser:used',
  BrowserDownloaded: 'browser:downloaded',
  BrowserPermissionAsked: 'browser:permissionAsked',
  BrowserPermissionAnswer: 'browser:permissionAnswer',
  BrowserPermissionClosed: 'browser:permissionClosed',
  ListModels: 'models:list',
  Balance: 'models:balance',
  UpdateState: 'update:state',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateRestart: 'update:restart',
  UpdateChanged: 'update:changed',
  Notify: 'app:notify',
  NoticeClicked: 'app:noticeClicked',
  SetBadge: 'app:setBadge',
  PresenceContext: 'presence:context',
  PresenceRows: 'presence:rows',
  PresenceAck: 'presence:ack',
  SaveFile: 'dialog:saveFile',
  OpenPath: 'shell:openPath',
  RevealFile: 'shell:revealFile',
  ContextMenu: 'menu:context',
  SetColorScheme: 'theme:setColorScheme',
  SetAppIcon: 'theme:setAppIcon',
} as const

/** Packaged builds serve the renderer from app://ollupi; the backend is told
 * to allow that origin. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'

/** The profile a home is made with (the sidecar's firstProfile): the app names
 * every connection by a profile, so a fresh home starts as this one. */
export const FIRST_PROFILE = 'default'
