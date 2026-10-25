// Main-process side of the DesktopApi: native capabilities the renderer may
// ask for. Every handler validates its input; the renderer is not trusted
// with arbitrary shell access.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isAbsolute, join } from 'node:path'
import { IpcChannel, type AppInfo, type BackendState } from '../shared/ipc'
import type { BackendSupervisor } from './backend/supervisor'

export function registerIpc(backend: BackendSupervisor, home: string): void {
  const info: AppInfo = {
    version: app.getVersion(),
    platform: process.platform,
    home,
    configPath: join(home, 'config.yaml'),
  }
  ipcMain.handle(IpcChannel.Info, () => info)
  ipcMain.handle(IpcChannel.BackendState, () => backend.state)
  ipcMain.handle(IpcChannel.BackendRestart, () => backend.restart())
  ipcMain.handle(IpcChannel.PickDirectory, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? undefined : res.filePaths[0]
  })
  ipcMain.handle(IpcChannel.OpenPath, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('expected an absolute path')
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  ipcMain.handle(IpcChannel.OpenExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('expected an http(s) URL')
    await shell.openExternal(url)
  })

  backend.on('state', (state: BackendState) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.BackendChanged, state)
  })
}
