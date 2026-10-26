// The main-process side of DesktopApi: the native capabilities the renderer
// may use. Handlers validate their input; the renderer gets no general shell
// access.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isAbsolute, join } from 'node:path'
import { IpcChannel, type AppInfo, type BackendState } from '../shared/ipc'
import type { BackendSupervisor } from './backend/supervisor'

export function registerIpc(backend: BackendSupervisor, home: string): void {
  const info: AppInfo = { version: app.getVersion(), platform: process.platform, home, configPath: join(home, 'config.yaml') }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
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
