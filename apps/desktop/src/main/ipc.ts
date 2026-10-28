// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, shell } from 'electron'
import { isAbsolute, join } from 'node:path'
import { colorSchemes, IpcChannel, type AppInfo, type BackendState, type ColorScheme, type ConfigChange } from '../shared/ipc'
import type { BackendConfig } from './backend/config'
import type { BackendSkills } from './backend/skills'
import type { WorkspaceChanges } from './changes'
import type { BackendSupervisor } from './backend/supervisor'
import { listFolder, readFile } from './files'
import { listModels } from './models'

export function registerIpc(backend: BackendSupervisor, config: BackendConfig, skills: BackendSkills, changes: WorkspaceChanges, home: string): void {
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
  ipcMain.handle(IpcChannel.ChangesDiff, (_event, root: unknown, path: unknown, untracked: unknown) =>
    changes.diff(absolute(root), text(path), untracked === true),
  )
  ipcMain.handle(IpcChannel.ListModels, (_event, baseUrl: unknown, apiKey: unknown) => {
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string') throw new Error('expected a base URL and an API key')
    return listModels(net.fetch, baseUrl, apiKey)
  })
  ipcMain.handle(IpcChannel.PickDirectory, (event) => pickDirectory(event.sender, true))
  ipcMain.handle(IpcChannel.OpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('expected an absolute path')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  ipcMain.handle(IpcChannel.SetColorScheme, (_event, scheme: unknown) => {
    if (!colorSchemes.includes(scheme as ColorScheme)) throw new Error('expected system, light or dark')
    nativeTheme.themeSource = scheme as ColorScheme
  })

  backend.on('state', (state: BackendState) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.BackendChanged, state)
  })
}

/** A folder the user chooses; create lets them make a new one. */
async function pickDirectory(sender: Electron.WebContents, create: boolean): Promise<string | undefined> {
  const opts: Electron.OpenDialogOptions = { properties: create ? ['openDirectory', 'createDirectory'] : ['openDirectory'] }
  const win = BrowserWindow.fromWebContents(sender)
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return res.canceled ? undefined : res.filePaths[0]
}

function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('expected an absolute path')
  return value
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
