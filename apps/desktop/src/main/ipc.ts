// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { apiTypes, colorSchemes, IpcChannel, type ApiType, type AppInfo, type BackendState, type BrowserBounds, type BrowserState, type ColorScheme, type ConfigChange, type FileChange, type ThreadNotice, type UpdateState } from '../shared/ipc'
import type { BackendConfig } from './backend/config'
import type { BackendSkills } from './backend/skills'
import type { AgentBrowser } from './browser/browser'
import type { WorkspaceChanges } from './changes'
import type { BackendSupervisor } from './backend/supervisor'
import { listFolder, readFile } from './files'
import { listModels } from './models'
import { setBadge, showNotice } from './notices'
import type { Terminals } from './terminal'
import type { AppUpdater } from './update'

export function registerIpc(
  backend: BackendSupervisor,
  config: BackendConfig,
  skills: BackendSkills,
  changes: WorkspaceChanges,
  browser: AgentBrowser,
  terminals: Terminals,
  updater: AppUpdater,
  home: string,
): void {
  const info: AppInfo = { version: app.getVersion(), platform: process.platform, home, configPath: join(home, 'config.yaml') }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
  ipcMain.handle(IpcChannel.ConfigRead, () => config.read())
  ipcMain.handle(IpcChannel.ConfigApply, (_event, changes: unknown) => config.apply(validChanges(changes)))
  ipcMain.handle(IpcChannel.SkillsList, () => skills.list())
  ipcMain.handle(IpcChannel.SkillsRead, (_event, name: unknown) => skills.read(text(name)))
  ipcMain.handle(IpcChannel.SkillsCreate, (_event, skill: unknown) => {
    const s = skill as Record<string, unknown> | null
    return skills.create({ name: text(s?.name), description: text(s?.description), instructions: text(s?.instructions) })
  })
  ipcMain.handle(IpcChannel.SkillsSave, (_event, name: unknown, content: unknown) => skills.save(text(name), text(content)))
  ipcMain.handle(IpcChannel.SkillsImport, async (event) => {
    const source = await pickDirectory(event.sender, false)
    return source === undefined ? undefined : skills.import(source)
  })
  ipcMain.handle(IpcChannel.SkillsRemove, (_event, name: unknown) => skills.remove(text(name)))
  ipcMain.handle(IpcChannel.SkillsDefaultFolder, () => skills.defaultFolder())
  ipcMain.handle(IpcChannel.FilesList, (_event, root: unknown, path: unknown) => listFolder(text(root), text(path)))
  ipcMain.handle(IpcChannel.FilesRead, (_event, root: unknown, path: unknown) => readFile(text(root), text(path)))
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
  ipcMain.handle(IpcChannel.TerminalOpen, (_event, key: unknown, cwd: unknown, cols: unknown, rows: unknown) =>
    terminals.open(text(key), absolute(cwd), size(cols), size(rows)),
  )
  ipcMain.handle(IpcChannel.TerminalWrite, (_event, key: unknown, data: unknown) => terminals.write(text(key), text(data)))
  ipcMain.handle(IpcChannel.TerminalResize, (_event, key: unknown, cols: unknown, rows: unknown) => terminals.resize(text(key), size(cols), size(rows)))
  ipcMain.handle(IpcChannel.TerminalClose, (_event, key: unknown) => terminals.close(text(key)))
  ipcMain.handle(IpcChannel.BrowserState, (_event, thread: unknown) => browser.state(text(thread)))
  ipcMain.handle(IpcChannel.BrowserPlace, (_event, thread: unknown, bounds: unknown) => browser.place(text(thread), validBounds(bounds)))
  ipcMain.handle(IpcChannel.BrowserOpen, (_event, thread: unknown, url: unknown) => browser.open(text(thread), text(url)))
  ipcMain.handle(IpcChannel.BrowserBack, (_event, thread: unknown) => browser.back(text(thread)))
  ipcMain.handle(IpcChannel.BrowserForward, (_event, thread: unknown) => browser.forward(text(thread)))
  ipcMain.handle(IpcChannel.BrowserReload, (_event, thread: unknown) => browser.reload(text(thread)))
  ipcMain.handle(IpcChannel.ListModels, (_event, type: unknown, baseUrl: unknown, apiKey: unknown) => {
    if (!apiTypes.includes(type as ApiType)) throw new Error('expected an API type')
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string') throw new Error('expected a base URL and an API key')
    return listModels(net.fetch, type as ApiType, baseUrl, apiKey)
  })
  ipcMain.handle(IpcChannel.UpdateState, () => updater.state)
  ipcMain.handle(IpcChannel.UpdateCheck, () => updater.check())
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
  ipcMain.handle(IpcChannel.PickDirectory, (event) => pickDirectory(event.sender, true))
  ipcMain.handle(IpcChannel.SaveFile, (event, name: unknown, content: unknown) => saveFile(event.sender, basename(text(name)), text(content)))
  ipcMain.handle(IpcChannel.OpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('expected an absolute path')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  ipcMain.handle(IpcChannel.SetColorScheme, (_event, scheme: unknown) => {
    if (!colorSchemes.includes(scheme as ColorScheme)) throw new Error('expected system, light or dark')
    nativeTheme.themeSource = scheme as ColorScheme
  })

  const send = (channel: string, ...args: unknown[]) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, ...args)
  }
  backend.on('state', (state: BackendState) => send(IpcChannel.BackendChanged, state))
  browser.on('state', (thread: string, state: BrowserState) => send(IpcChannel.BrowserChanged, thread, state))
  browser.on('used', (thread: string) => send(IpcChannel.BrowserUsed, thread))
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

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('expected a list of strings')
  return value.map(text)
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a string')
  return value
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
