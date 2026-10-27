// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isAbsolute, join } from 'node:path'
import { IpcChannel, type AppInfo, type BackendState, type ConfigChange } from '../shared/ipc'
import type { BackendConfig } from './backend/config'
import type { BackendSupervisor } from './backend/supervisor'

export function registerIpc(backend: BackendSupervisor, config: BackendConfig, home: string): void {
  const info: AppInfo = { version: app.getVersion(), platform: process.platform, home, configPath: join(home, 'config.yaml') }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
  ipcMain.handle(IpcChannel.ConfigRead, () => config.read())
  ipcMain.handle(IpcChannel.ConfigApply, (_event, changes: unknown) => config.apply(validChanges(changes)))
  ipcMain.handle(IpcChannel.PickDirectory, async (event) => {
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? undefined : res.filePaths[0]
  })
  ipcMain.handle(IpcChannel.OpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('expected an absolute path')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })

  backend.on('state', (state: BackendState) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.BackendChanged, state)
  })
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
