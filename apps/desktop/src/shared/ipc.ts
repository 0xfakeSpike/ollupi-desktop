// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

import type { ConfigCheck as CheckOutput } from './generated/backend-config'
import type { SkillsCheck } from './generated/backend-skills'

/** config.yaml as the backend decodes it. */
export type BackendConfig = NonNullable<CheckOutput['config']>
/** One model as the app selects it: id is provider/name. */
export type ConfigModel = NonNullable<CheckOutput['models']>[number]
/** ollupid --check-config's result: the config with its models in order, or
 * why the backend would not start with it. */
export type ConfigCheck = { ok: true; config: BackendConfig; models: ConfigModel[] } | { ok: false; error: string }

/** The backend process as the supervisor sees it. */
export type BackendState =
  | { status: 'starting' }
  | { status: 'ready'; url: string; token: string; version: string }
  | { status: 'failed'; failure: BackendFailure; configPath: string | undefined; log: string }
  | { status: 'stopped' }

/** Why the backend is not running. The renderer words it in the app's
 * language; only what ollupi itself reported (reported.message) is shown
 * as written. */
export type BackendFailure =
  | { kind: 'timeout'; seconds: number }
  | { kind: 'spawn'; binary: string; error: string }
  | { kind: 'exited'; how: string }
  | { kind: 'reported'; message: string | undefined }

export interface AppInfo {
  version: string
  platform: string
  /** The backend's data and config directory. */
  home: string
  configPath: string
  /** The backend's log file. */
  backendLog: string
}

/** One edit to config.yaml, by key path, e.g. ['memory', 'generate']. A move
 * takes the list item at path to index `to` of the same list. */
export type ConfigChange =
  | { kind: 'set'; path: (string | number)[]; value: unknown }
  | { kind: 'delete'; path: (string | number)[] }
  | { kind: 'move'; path: (string | number)[]; to: number }

/** The API a provider speaks (config.yaml's type), which picks the
 * backend's client for it. */
export const apiTypes = ['openai', 'anthropic', 'gemini'] as const
export type ApiType = (typeof apiTypes)[number]

/** One model an API lists, with its limits when the API says them. */
export interface ListedModel {
  name: string
  limits?: { context: number; output: number }
}

/** The models a provider's API lists, or why it could not be asked. */
export type ModelList = { ok: true; models: ListedModel[] } | { ok: false; error: string }

/** One skill as the agent loads it from its SKILL.md. */
export type Skill = NonNullable<SkillsCheck['skills']>[number]
/** The skills folder and its skills as the agent would load them, or why
 * the agent would not start with the folder. dir is empty while config.yaml
 * sets no skills_dir, which turns skills off. */
export type SkillList = { ok: true; dir: string; skills: Skill[] } | { ok: false; dir: string; error: string }
/** A change to the skills folder, or why the agent's rules refused it. */
export type SkillChange = { ok: true } | { ok: false; error: string }
/** What a new skill's SKILL.md is written from. */
export interface NewSkill {
  name: string
  description: string
  instructions: string
}

/** One entry of a workspace folder. */
export interface FileEntry {
  name: string
  kind: 'file' | 'folder'
}

/** A workspace file as a preview shows it: its text (only the start of a
 * long file), an image, or neither. size is the file's, in bytes. */
export type FilePreview =
  | { kind: 'text'; size: number; text: string; truncated: boolean }
  | { kind: 'image'; size: number; dataUrl: string }
  | { kind: 'binary'; size: number }

/** A file that differs from the last commit, as git sees it under the
 * workspace. Line counts are absent for a binary or untracked file. staged
 * is how much of the change the index holds: all of it, part of it (more
 * changed in the working tree since), or none. */
export interface FileChange {
  path: string
  kind: 'modified' | 'added' | 'deleted' | 'untracked'
  staged: 'all' | 'part' | 'none'
  added?: number
  removed?: number
}

/** A commit just made: its short hash and subject. */
export interface Commit {
  hash: string
  subject: string
}

/** A workspace's uncommitted changes, or that it is not in a git
 * repository. */
export type Changes = { repo: false } | { repo: true; files: FileChange[] }

/** A file's diff against the last commit; only the start of a long one. */
export interface FileDiff {
  text: string
  truncated: boolean
}

/** The app's browser page as its panel shows it. */
export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** Where the browser panel shows the page, in the window's content. */
export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

/** The tool provider the app's browser is in the backend, whose tools are
 * browser_<action>; config.yaml cannot give an MCP server the name. */
export const BROWSER_PROVIDER = 'browser'

/** The app's own updates, from its GitHub releases. unsupported is a build
 * not running from an installed .app (development). A downloaded update is
 * ready: it is installed when the app quits. */
export type UpdateState =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; received: number; total: number }
  | { status: 'ready'; version: string }
  /** version is the release that failed to download; undefined when the
   * check failed. */
  | { status: 'failed'; version: string | undefined; failure: UpdateFailure }

/** The app's GitHub releases, which it updates from. */
export const RELEASES_URL = 'https://github.com/0xfakeSpike/ollupi-desktop/releases'

/** Why an update failed. location: the app's folder cannot be written, so
 * the app cannot be replaced where it is (e.g. run from the dmg). */
export type UpdateFailure = { kind: 'location'; path: string } | { kind: 'error'; message: string }

/** Light or dark, or whichever the system uses. */
export type ColorScheme = 'system' | 'light' | 'dark'
export const colorSchemes: readonly ColorScheme[] = ['system', 'light', 'dark']

/** A system notification about a thread; clicking it opens the thread. */
export interface ThreadNotice {
  threadId: string
  title: string
  body: string
}

export interface DesktopApi {
  info(): Promise<AppInfo>
  backend: {
    state(): Promise<BackendState>
    restart(): Promise<void>
    onState(listener: (state: BackendState) => void): () => void
  }
  config: {
    read(): Promise<ConfigCheck>
    /** Validates the changed file with the backend; when it passes, writes it
     * and restarts the backend, since ollupi reads its config only at start. */
    apply(changes: ConfigChange[]): Promise<ConfigCheck>
  }
  /** The folder config.yaml's skills_dir names. A change is checked with
   * the agent's own catalog before it reaches the folder; one that passes
   * restarts the backend, which loads skills only at start. */
  skills: {
    list(): Promise<SkillList>
    read(name: string): Promise<string>
    create(skill: NewSkill): Promise<SkillChange>
    save(name: string, text: string): Promise<SkillChange>
    /** Asks for a skill folder and copies it in; undefined when none was
     * chosen. */
    import(): Promise<SkillChange | undefined>
    /** Moves the skill's folder to the Trash. */
    remove(name: string): Promise<void>
    /** Creates the skills folder in the backend's home and gives the
     * skills_dir value that names it. */
    defaultFolder(): Promise<string>
  }
  /** Files sent with a message. ollupi takes a file by its path and copies
   * it while it takes the message. */
  attachments: {
    /** The file's path on this machine; undefined for one that exists only
     * in memory, such as a pasted screenshot. */
    pathOf(file: File): string | undefined
    /** Writes a file that has no path to a temporary one, to send it. */
    writeTemp(name: string, data: Uint8Array): Promise<string>
    /** Removes a temporary file once its message is sent or refused. */
    removeTemp(path: string): Promise<void>
  }
  /** A workspace's files, read-only; path is relative to the root, and
   * nothing outside the root is read. */
  files: {
    list(root: string, path: string): Promise<FileEntry[]>
    read(root: string, path: string): Promise<FilePreview>
  }
  /** A workspace's uncommitted changes, from git, and what the person does
   * with them. Paths are relative to the root, inside it. */
  changes: {
    list(root: string): Promise<Changes>
    diff(root: string, path: string, untracked: boolean): Promise<FileDiff>
    stage(root: string, paths: string[]): Promise<void>
    unstage(root: string, paths: string[]): Promise<void>
    /** Puts the file back as the last commit has it. Content no commit
     * holds (a new file) goes to the Trash rather than away. */
    discard(root: string, file: FileChange): Promise<void>
    /** Commits what is staged. */
    commit(root: string, message: string): Promise<Commit>
  }
  /** The person's own shell in a workspace's folder, a terminal per key
   * (the workspace). It keeps running while no panel shows it. */
  terminal: {
    /** Starts the shell unless it runs, and answers its output so far. */
    open(key: string, cwd: string, cols: number, rows: number): Promise<string>
    write(key: string, text: string): Promise<void>
    resize(key: string, cols: number, rows: number): Promise<void>
    /** Ends the shell. */
    close(key: string): Promise<void>
    onData(listener: (key: string, text: string) => void): () => void
    onExit(listener: (key: string, code: number) => void): () => void
  }
  /** The app's browser: a tab per thread, which the person and that
   * thread's agent share. */
  browser: {
    state(thread: string): Promise<BrowserState>
    /** Shows the thread's tab over the panel's area; undefined hides it. */
    place(thread: string, bounds: BrowserBounds | undefined): Promise<void>
    open(thread: string, url: string): Promise<void>
    back(thread: string): Promise<void>
    forward(thread: string): Promise<void>
    reload(thread: string): Promise<void>
    onState(listener: (thread: string, state: BrowserState) => void): () => void
    /** The thread's agent acted in its tab. */
    onUsed(listener: (thread: string) => void): () => void
  }
  /** Asks a provider's API which models it serves. The main process asks,
   * as the API would not answer the renderer's origin. An empty base URL is
   * the API's own, as for the backend. */
  listModels(type: ApiType, baseUrl: string, apiKey: string): Promise<ModelList>
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
  pickDirectory(): Promise<string | undefined>
  /** Asks where to save text, suggesting a file name in Documents, and
   * writes it there; undefined when the person cancelled. */
  saveFile(name: string, text: string): Promise<string | undefined>
  openPath(path: string): Promise<void>
  /** Sets the window's scheme, which the renderer's prefers-color-scheme
   * and the native window chrome both follow. */
  setColorScheme(scheme: ColorScheme): Promise<void>
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  ConfigRead: 'config:read',
  ConfigApply: 'config:apply',
  SkillsList: 'skills:list',
  SkillsRead: 'skills:read',
  SkillsCreate: 'skills:create',
  SkillsSave: 'skills:save',
  SkillsImport: 'skills:import',
  SkillsRemove: 'skills:remove',
  SkillsDefaultFolder: 'skills:defaultFolder',
  AttachmentsWrite: 'attachments:write',
  AttachmentsRemove: 'attachments:remove',
  FilesList: 'files:list',
  FilesRead: 'files:read',
  ChangesList: 'changes:list',
  ChangesDiff: 'changes:diff',
  ChangesStage: 'changes:stage',
  ChangesUnstage: 'changes:unstage',
  ChangesDiscard: 'changes:discard',
  ChangesCommit: 'changes:commit',
  TerminalOpen: 'terminal:open',
  TerminalWrite: 'terminal:write',
  TerminalResize: 'terminal:resize',
  TerminalClose: 'terminal:close',
  TerminalData: 'terminal:data',
  TerminalExit: 'terminal:exit',
  BrowserState: 'browser:state',
  BrowserPlace: 'browser:place',
  BrowserOpen: 'browser:open',
  BrowserBack: 'browser:back',
  BrowserForward: 'browser:forward',
  BrowserReload: 'browser:reload',
  BrowserChanged: 'browser:changed',
  BrowserUsed: 'browser:used',
  ListModels: 'models:list',
  UpdateState: 'update:state',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateRestart: 'update:restart',
  UpdateChanged: 'update:changed',
  Notify: 'app:notify',
  NoticeClicked: 'app:noticeClicked',
  SetBadge: 'app:setBadge',
  PickDirectory: 'dialog:pickDirectory',
  SaveFile: 'dialog:saveFile',
  OpenPath: 'shell:openPath',
  SetColorScheme: 'theme:setColorScheme',
} as const

/** Packaged builds serve the renderer from app://ollupi; the backend is told
 * to allow that origin. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'
