// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, shell, type WebContents } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { apiTypes, appThemes, colorSchemes, IpcChannel, LOCAL_SERVER, type ApiType, type AppTheme, type AppInfo, type BackendState, type BrowserBounds, type BrowserDownload, type BrowserPermission, type BrowserState, type ColorScheme, type ContextMenuItem, type PresenceAck, type PresenceContext, type SandboxInput, type ServerInput, type ThreadNotice, type UpdateState } from '../shared/ipc'
import { setAppIcon } from './appIcon'
import { activeProfile, PROFILE_ID, rememberProfile } from './profile'
import type { BackendHome } from './backend/home'
import type { BackendSkills } from './backend/skills'
import type { SandboxStore } from './backend/sandbox'
import type { ServerStore, ServerTarget } from './backend/servers'
import { START_PAGE, typedPage } from './browser/address'
import type { Bookmarks } from './browser/bookmarks'
import type { AgentBrowser } from './browser/browser'
import type { History } from './browser/history'
import { suggest } from './browser/suggest'
import type { BackendSupervisor } from './backend/supervisor'
import { providerBalance } from './balance'
import { listModels } from './models'
import { setBadge, showNotice } from './notices'
import type { Presence } from './presence/presence'
import type { AppUpdater } from './update'

export function registerIpc(
  backend: BackendSupervisor,
  servers: ServerStore,
  sandboxes: SandboxStore,
  backendHome: BackendHome,
  skills: BackendSkills,
  browser: AgentBrowser,
  bookmarks: Bookmarks,
  history: History,
  updater: AppUpdater,
  presence: Presence,
  home: string,
  backendLog: string,
): void {
  const info: AppInfo = { version: app.getVersion(), platform: process.platform, home, backendLog, userHome: app.getPath('home') }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
  ipcMain.handle(IpcChannel.BackendCheck, () => backend.check())
  ipcMain.handle(IpcChannel.ServersRead, () => servers.read())
  // A new server, an edit or a switch that changes what the window connects
  // to starts the backend over and reloads the windows, whose CSP names the
  // one host they reach. Settings kept while the window runs its own change
  // nothing yet.
  ipcMain.handle(IpcChannel.ServersSave, async (_event, input: unknown) => {
    const before = await servers.target().catch(() => undefined)
    await servers.save(serverInput(input))
    await reconnect(servers, backend, before)
  })
  ipcMain.handle(IpcChannel.ServersSelect, async (_event, id: unknown) => {
    const before = await servers.target().catch(() => undefined)
    await servers.select(serverID(id))
    await reconnect(servers, backend, before)
  })
  ipcMain.handle(IpcChannel.ServersRemove, (_event, id: unknown) => servers.remove(serverID(id)))
  ipcMain.handle(IpcChannel.SandboxRead, () => sandboxes.read())
  // What a backend offers as sandboxes is fixed at its start, so a change
  // starts it again: the window reconnects and reads the providers with its
  // environments.
  ipcMain.handle(IpcChannel.SandboxSave, async (_event, input: unknown) => {
    await sandboxes.save(sandboxInput(input))
    await backend.restart()
  })
  ipcMain.handle(IpcChannel.SandboxClear, async () => {
    await sandboxes.clear()
    await backend.restart()
  })
  ipcMain.handle(IpcChannel.SkillsImport, async (event) => {
    const source = await pickDirectory(event.sender)
    return source === undefined ? undefined : skills.read(source)
  })
  ipcMain.handle(IpcChannel.ProfileDelete, async (_event, profile: unknown) => {
    const id = profileID(profile)
    if (id === activeProfile()) throw new Error('switch away from a profile before deleting it')
    // The profiles a server holds are its store's, which this Mac cannot
    // reach; the local backend would be the one deleted from.
    if (backend.onRemote) throw new Error('a profile of a server is not deleted from this Mac')
    // The backend refuses the last profile, and one with a turn running.
    const threads = await backendHome.deleteProfile(id)
    await Promise.all(threads.map((thread) => rm(join(home, 'attachments', thread), { recursive: true, force: true })))
    await rm(join(home, 'users', id), { recursive: true, force: true })
  })
  // The profile the window acts as: the choice is kept for the next start,
  // and the backend's next connection is named by it. The backend refuses a
  // token for a profile its store does not hold.
  ipcMain.handle(IpcChannel.ProfileSelect, (_event, profile: unknown) => {
    const id = profileID(profile)
    rememberProfile(id)
    backend.selectProfile(id)
  })
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

/** A folder of this Mac the user chooses, as a skill to import. */
async function pickDirectory(sender: Electron.WebContents): Promise<string | undefined> {
  const opts: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
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

function tabId(value: unknown): number {
  if (!Number.isInteger(value)) throw new Error('expected a tab id')
  return value as number
}

/** The id of a page's question, as the panel answers it. */
function askId(value: unknown): number {
  if (!Number.isInteger(value)) throw new Error('expected a question id')
  return value as number
}

function serverInput(value: unknown): ServerInput {
  const v = value as Partial<ServerInput> | null
  const id = v?.id
  if (id !== undefined && typeof id !== 'string') throw new Error('expected a server')
  return { id, name: text(v?.name), url: text(v?.url), token: text(v?.token), accessClientId: text(v?.accessClientId), accessClientSecret: text(v?.accessClientSecret) }
}

/** A server's id, or the one this app runs itself. */
function serverID(value: unknown): string {
  const id = text(value)
  if (id !== LOCAL_SERVER && !id) throw new Error('expected a server')
  return id
}

function sandboxInput(value: unknown): SandboxInput {
  const v = value as Partial<SandboxInput> | null
  return { url: text(v?.url), key: text(v?.key) }
}

/** Restarts the backend and reloads the windows when what the window
 * connects to changed: another address, token or Access token. */
async function reconnect(servers: ServerStore, backend: BackendSupervisor, before: ServerTarget | undefined): Promise<void> {
  const after = await servers.target().catch(() => undefined)
  if (sameTarget(before, after)) return
  await backend.restart()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.reload()
}

function sameTarget(a: ServerTarget | undefined, b: ServerTarget | undefined): boolean {
  if (!a || !b) return a === b
  return a.url === b.url && a.token === b.token && a.access?.clientId === b.access?.clientId && a.access?.clientSecret === b.access?.clientSecret
}

/** A profile id, as the backend names one: its hub folder is a folder of
 * this name, so it holds no separator and no dot-dot. */
function profileID(value: unknown): string {
  const id = text(value)
  if (!PROFILE_ID.test(id)) throw new Error('not a profile id')
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
