// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, shell, type WebContents } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { apiTypes, appThemes, colorSchemes, FIRST_PROFILE, IpcChannel, skillAgents, type SkillAgent, type ApiType, type AppTheme, type AppInfo, type BackendState, type BrowserBounds, type BrowserDownload, type BrowserPermission, type BrowserState, type ColorScheme, type ConfigChange, type ContextMenuItem, type FileChange, type PresenceAck, type PresenceContext, type ThreadNotice, type UpdateState } from '../shared/ipc'
import { setAppIcon } from './appIcon'
import type { TempAttachments } from './attachments'
import type { BackendConfig } from './backend/config'
import type { BackendSkills } from './backend/skills'
import { START_PAGE, typedPage } from './browser/address'
import type { Bookmarks } from './browser/bookmarks'
import type { AgentBrowser } from './browser/browser'
import type { History } from './browser/history'
import { suggest } from './browser/suggest'
import type { WorkspaceChanges } from './changes'
import type { BackendSupervisor } from './backend/supervisor'
import { kindOf, listFolder, readFile } from './files'
import { providerBalance } from './balance'
import { listModels } from './models'
import { setBadge, showNotice } from './notices'
import type { Presence } from './presence/presence'
import type { Terminals } from './terminal'
import type { AppUpdater } from './update'

export function registerIpc(
  backend: BackendSupervisor,
  config: BackendConfig,
  skills: BackendSkills,
  changes: WorkspaceChanges,
  browser: AgentBrowser,
  bookmarks: Bookmarks,
  history: History,
  terminals: Terminals,
  attachments: TempAttachments,
  updater: AppUpdater,
  presence: Presence,
  home: string,
  backendLog: string,
): void {
  const info: AppInfo = { version: app.getVersion(), platform: process.platform, home, configPath: join(home, 'config.yaml'), backendLog }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
  ipcMain.handle(IpcChannel.ConfigRead, () => config.read())
  ipcMain.handle(IpcChannel.ConfigApply, (_event, changes: unknown) => config.apply(validChanges(changes)))
  ipcMain.handle(IpcChannel.SkillsList, () => skills.list())
  ipcMain.handle(IpcChannel.SkillsRead, (_event, agent: unknown, name: unknown) => skills.read(skillAgent(agent), text(name)))
  ipcMain.handle(IpcChannel.SkillsCreate, (_event, agent: unknown, skill: unknown) => {
    const s = skill as Record<string, unknown> | null
    return skills.create(skillAgent(agent), { name: text(s?.name), description: text(s?.description), instructions: text(s?.instructions) })
  })
  ipcMain.handle(IpcChannel.SkillsSave, (_event, agent: unknown, name: unknown, content: unknown) => skills.save(skillAgent(agent), text(name), text(content)))
  ipcMain.handle(IpcChannel.SkillsImport, async (event, agent: unknown) => {
    const to = skillAgent(agent)
    const source = await pickDirectory(event.sender, false)
    return source === undefined ? undefined : skills.import(to, source)
  })
  ipcMain.handle(IpcChannel.SkillsCopy, (_event, agent: unknown, name: unknown, to: unknown) => skills.copy(skillAgent(agent), text(name), skillAgent(to)))
  ipcMain.handle(IpcChannel.SkillsRemove, (_event, agent: unknown, name: unknown) => skills.remove(skillAgent(agent), text(name)))
  ipcMain.handle(IpcChannel.SkillsDefaultFolder, () => skills.defaultFolder())
  // The hub keeps nothing of the projects in it; a folder of its own in the
  // backend's home keeps the user's folders out of it. The first profile keeps
  // the home's folder, as it was before there were profiles; a later one gets
  // one of its own, so two hubs never write the same files.
  ipcMain.handle(IpcChannel.SuperAgentFolder, async (_event, profile: unknown) => {
    const id = profileID(profile)
    const folder = id === FIRST_PROFILE ? join(home, 'super-agent') : join(home, 'users', id, 'super-agent')
    await mkdir(folder, { recursive: true })
    return folder
  })
  ipcMain.handle(IpcChannel.FilesList, (_event, root: unknown, path: unknown) => listFolder(text(root), text(path)))
  ipcMain.handle(IpcChannel.FilesRead, (_event, root: unknown, path: unknown) => readFile(text(root), text(path)))
  ipcMain.handle(IpcChannel.FilesKind, (_event, root: unknown, path: unknown) => kindOf(text(root), text(path)))
  ipcMain.handle(IpcChannel.ChangesList, (_event, root: unknown) => changes.list(absolute(root)))
  ipcMain.handle(IpcChannel.ChangesStage, (_event, root: unknown, paths: unknown) => changes.stage(absolute(root), texts(paths)))
  ipcMain.handle(IpcChannel.ChangesUnstage, (_event, root: unknown, paths: unknown) => changes.unstage(absolute(root), texts(paths)))
  ipcMain.handle(IpcChannel.ChangesDiscard, (_event, root: unknown, file: unknown) => {
    const f = file as FileChange
    if (!['modified', 'added', 'deleted', 'untracked'].includes(f?.kind)) throw new Error('expected a changed file')
    return changes.discard(absolute(root), { path: text(f.path), kind: f.kind, staged: f.staged })
  })
  ipcMain.handle(IpcChannel.ChangesCommit, (_event, root: unknown, message: unknown) => changes.commit(absolute(root), text(message)))
  ipcMain.handle(IpcChannel.ChangesDiff, (_event, root: unknown, path: unknown, untracked: unknown) =>
    changes.diff(absolute(root), text(path), untracked === true),
  )
  ipcMain.handle(IpcChannel.AttachmentsWrite, (_event, name: unknown, data: unknown) => {
    if (!(data instanceof Uint8Array)) throw new Error('expected bytes')
    return attachments.write(text(name), data)
  })
  ipcMain.handle(IpcChannel.AttachmentsRemove, (_event, path: unknown) => attachments.remove(absolute(path)))
  ipcMain.handle(IpcChannel.TerminalOpen, (_event, key: unknown, cwd: unknown, cols: unknown, rows: unknown) =>
    terminals.open(text(key), absolute(cwd), size(cols), size(rows)),
  )
  ipcMain.handle(IpcChannel.TerminalWrite, (_event, key: unknown, data: unknown) => terminals.write(text(key), text(data)))
  ipcMain.handle(IpcChannel.TerminalResize, (_event, key: unknown, cols: unknown, rows: unknown) => terminals.resize(text(key), size(cols), size(rows)))
  ipcMain.handle(IpcChannel.TerminalClose, (_event, key: unknown) => terminals.close(text(key)))
  ipcMain.handle(IpcChannel.BrowserState, (_event, thread: unknown) => browser.state(text(thread)))
  ipcMain.handle(IpcChannel.BrowserPlace, (_event, thread: unknown, bounds: unknown) => browser.place(text(thread), validBounds(bounds)))
  ipcMain.handle(IpcChannel.BrowserOpen, (_event, thread: unknown, url: unknown) => browser.open(text(thread), typedPage(text(url))))
  ipcMain.handle(IpcChannel.BrowserNewTab, (_event, thread: unknown) => browser.openTab(text(thread), START_PAGE))
  ipcMain.handle(IpcChannel.BrowserStart, (_event, thread: unknown) => browser.start(text(thread)))
  ipcMain.handle(IpcChannel.BrowserSelectTab, (_event, thread: unknown, id: unknown) => browser.select(text(thread), tabId(id)))
  ipcMain.handle(IpcChannel.BrowserCloseTab, (_event, thread: unknown, id: unknown) => browser.close(text(thread), tabId(id)))
  ipcMain.handle(IpcChannel.BrowserForget, (_event, thread: unknown) => browser.forget(text(thread)))
  ipcMain.handle(IpcChannel.BrowserHandOver, (_event, from: unknown, to: unknown) => browser.handOver(text(from), text(to)))
  ipcMain.handle(IpcChannel.BookmarksList, () => bookmarks.list())
  ipcMain.handle(IpcChannel.BookmarksAdd, (_event, url: unknown, title: unknown) => bookmarks.add(text(url), text(title)))
  ipcMain.handle(IpcChannel.BookmarksRemove, (_event, url: unknown) => bookmarks.remove(text(url)))
  ipcMain.handle(IpcChannel.HistoryCount, () => history.count())
  ipcMain.handle(IpcChannel.HistoryList, (_event, filter: unknown) => history.list(typeof filter === 'string' ? filter : ''))
  ipcMain.handle(IpcChannel.HistoryRemove, (_event, url: unknown) => history.remove(text(url)))
  ipcMain.handle(IpcChannel.HistoryClear, () => history.clear())
  ipcMain.handle(IpcChannel.BrowserSuggest, async (_event, query: unknown) => {
    const [visited, kept] = await Promise.all([history.entries(), bookmarks.list()])
    return suggest(text(query), visited, [...kept.own, ...kept.chrome.flatMap((c) => c.bookmarks)])
  })
  ipcMain.handle(IpcChannel.BrowserBack, (_event, thread: unknown) => browser.back(text(thread)))
  ipcMain.handle(IpcChannel.BrowserForward, (_event, thread: unknown) => browser.forward(text(thread)))
  ipcMain.handle(IpcChannel.BrowserReload, (_event, thread: unknown) => browser.reload(text(thread)))
  ipcMain.handle(IpcChannel.BrowserPermissionAnswer, (_event, id: unknown, allow: unknown) => browser.answer(askId(id), allow === true))
  ipcMain.handle(IpcChannel.ListModels, (_event, type: unknown, baseUrl: unknown, apiKey: unknown) => {
    if (!apiTypes.includes(type as ApiType)) throw new Error('expected an API type')
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string') throw new Error('expected a base URL and an API key')
    return listModels(net.fetch, type as ApiType, baseUrl, apiKey)
  })
  ipcMain.handle(IpcChannel.Balance, (_event, baseUrl: unknown, apiKey: unknown) => providerBalance(net.fetch, text(baseUrl), text(apiKey)))
  ipcMain.handle(IpcChannel.UpdateState, () => updater.state)
  // A check the person asks for also lists betas; the automatic ones in the
  // updater look at stable releases only.
  ipcMain.handle(IpcChannel.UpdateCheck, () => updater.check({ prerelease: true }))
  ipcMain.handle(IpcChannel.UpdateDownload, () => updater.download())
  ipcMain.handle(IpcChannel.UpdateRestart, () => updater.restart())
  ipcMain.handle(IpcChannel.Notify, (_event, notice: unknown) => {
    const n = notice as ThreadNotice
    showNotice({ threadId: text(n?.threadId), title: text(n?.title), body: text(n?.body) }, (threadId) => send(IpcChannel.NoticeClicked, threadId))
  })
  ipcMain.handle(IpcChannel.SetBadge, (_event, count: unknown) => {
    if (!Number.isInteger(count) || (count as number) < 0) throw new Error('expected a count')
    setBadge(count as number)
  })
  // The renderer says what is on screen; the main process watches the window
  // and the idle clock itself and keeps the time in the backend's database.
  ipcMain.on(IpcChannel.PresenceContext, (_event, context: unknown) => presence.setContext(presenceContext(context)))
  ipcMain.on(IpcChannel.PresenceAck, (_event, ack: unknown) => {
    const answer = presenceAck(ack)
    if (answer) presence.onAck(answer)
  })
  ipcMain.handle(IpcChannel.PickDirectory, (event) => pickDirectory(event.sender, true))
  ipcMain.handle(IpcChannel.SaveFile, (event, name: unknown, content: unknown) => saveFile(event.sender, basename(text(name)), text(content)))
  ipcMain.handle(IpcChannel.OpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('expected an absolute path')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  ipcMain.handle(IpcChannel.RevealFile, (_event, path: unknown) => {
    shell.showItemInFolder(absolute(path))
  })
  ipcMain.handle(IpcChannel.ContextMenu, (event, items: unknown) => contextMenu(event.sender, menuItems(items)))
  ipcMain.handle(IpcChannel.SetColorScheme, (_event, scheme: unknown) => {
    if (!colorSchemes.includes(scheme as ColorScheme)) throw new Error('expected system, light or dark')
    nativeTheme.themeSource = scheme as ColorScheme
  })
  ipcMain.handle(IpcChannel.SetAppIcon, (_event, theme: unknown) => {
    if (!appThemes.includes(theme as AppTheme)) throw new Error('expected stone or dusk')
    setAppIcon(theme as AppTheme)
  })

  const send = (channel: string, ...args: unknown[]) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, ...args)
  }
  backend.on('state', (state: BackendState) => send(IpcChannel.BackendChanged, state))
  browser.on('state', (thread: string, state: BrowserState) => send(IpcChannel.BrowserChanged, thread, state))
  browser.on('used', (thread: string) => send(IpcChannel.BrowserUsed, thread))
  browser.on('downloaded', (thread: string, download: BrowserDownload) => send(IpcChannel.BrowserDownloaded, thread, download))
  browser.on('permission', (thread: string, permission: BrowserPermission) => send(IpcChannel.BrowserPermissionAsked, thread, permission))
  browser.on('permissionClosed', (thread: string, id: number) => send(IpcChannel.BrowserPermissionClosed, thread, id))
  terminals.on('data', (key: string, data: string) => send(IpcChannel.TerminalData, key, data))
  terminals.on('exit', (key: string, code: number) => send(IpcChannel.TerminalExit, key, code))
  updater.on('state', (state: UpdateState) => send(IpcChannel.UpdateChanged, state))
}

/** Writes text where the user chooses; undefined when they cancel. */
async function saveFile(sender: Electron.WebContents, name: string, content: string): Promise<string | undefined> {
  const opts: Electron.SaveDialogOptions = { defaultPath: join(app.getPath('documents'), name) }
  const win = BrowserWindow.fromWebContents(sender)
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return undefined
  await writeFile(res.filePath, content)
  return res.filePath
}

/** A folder the user chooses; create lets them make a new one. */
async function pickDirectory(sender: Electron.WebContents, create: boolean): Promise<string | undefined> {
  const opts: Electron.OpenDialogOptions = { properties: create ? ['openDirectory', 'createDirectory'] : ['openDirectory'] }
  const win = BrowserWindow.fromWebContents(sender)
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return res.canceled ? undefined : res.filePaths[0]
}

function validBounds(value: unknown): BrowserBounds | undefined {
  if (value === undefined || value === null) return undefined
  const b = value as BrowserBounds
  const whole = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (!whole(b.x) || !whole(b.y) || !whole(b.width) || !whole(b.height)) throw new Error('expected bounds')
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
}

function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('expected an absolute path')
  return value
}

/** A terminal's columns or rows. */
function size(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1000) throw new Error('expected a terminal size')
  return value as number
}

function tabId(value: unknown): number {
  if (!Number.isInteger(value)) throw new Error('expected a tab id')
  return value as number
}

/** The id of a page's question, as the panel answers it. */
function askId(value: unknown): number {
  if (!Number.isInteger(value)) throw new Error('expected a question id')
  return value as number
}

/** An agent a skill belongs to, one the app offers. */
function skillAgent(value: unknown): SkillAgent {
  const agent = text(value)
  if (!(skillAgents as readonly string[]).includes(agent)) throw new Error('expected an agent a skill belongs to')
  return agent as SkillAgent
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('expected a list of strings')
  return value.map(text)
}

/** A profile id, as the backend names one: its hub folder is a folder of
 * this name, so it holds no separator and no dot-dot. */
function profileID(value: unknown): string {
  const id = text(value)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('not a profile id')
  return id
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a string')
  return value
}

/** The conversation on screen, or null when the window shows none. A payload
 * that is not one is read as none: the window saying what it shows must not be
 * able to throw inside the main process. */
function presenceContext(value: unknown): PresenceContext | null {
  if (value === null || typeof value !== 'object') return null
  const context = value as Partial<PresenceContext>
  if (typeof context.threadId !== 'string' || typeof context.workspaceId !== 'string') return null
  if (!context.threadId) return null
  return { threadId: context.threadId, workspaceId: context.workspaceId }
}

/** The renderer's answer to one batch of stretches. */
function presenceAck(value: unknown): PresenceAck | null {
  const ack = value as Partial<PresenceAck> | null
  if (!ack || typeof ack.batch !== 'string') return null
  const outcome = ack.outcome
  if (outcome !== 'wrote' && outcome !== 'refused' && outcome !== 'failed') return null
  return { batch: ack.batch, outcome }
}

/** Changes come from the renderer: only key paths of strings and numbers,
 * and values that are plain JSON. */
function validChanges(changes: unknown): ConfigChange[] {
  if (!Array.isArray(changes)) throw new Error('expected a list of changes')
  return changes.map((c) => {
    const path = (c as ConfigChange)?.path
    if (!Array.isArray(path) || path.length === 0 || !path.every((p) => typeof p === 'string' || typeof p === 'number')) {
      throw new Error('a change needs a key path')
    }
    if (c.kind === 'delete') return { kind: 'delete', path }
    if (c.kind === 'move') {
      if (!Number.isInteger(c.to)) throw new Error('a move needs a list index')
      return { kind: 'move', path, to: c.to }
    }
    if (c.kind !== 'set') throw new Error('a change is set, delete or move')
    return { kind: 'set', path, value: JSON.parse(JSON.stringify(c.value ?? null)) }
  })
}

function menuItems(items: unknown): ContextMenuItem[] {
  if (!Array.isArray(items) || !items.every((i) => typeof i?.id === 'string' && typeof i?.label === 'string')) {
    throw new Error('expected menu items with an id and a label')
  }
  return items as ContextMenuItem[]
}

/** Pops a menu up at the pointer in the window that asked. The menu's
 * callback can run before the chosen item's click, so the close waits a
 * moment before settling on no choice. */
function contextMenu(sender: WebContents, items: ContextMenuItem[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(items.map((i) => ({ label: i.label, click: () => resolve(i.id) })))
    menu.popup({ window: BrowserWindow.fromWebContents(sender) ?? undefined, callback: () => setTimeout(() => resolve(undefined), 100) })
  })
}
