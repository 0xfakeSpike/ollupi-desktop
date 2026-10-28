// Main process entry: app lifecycle only. It wires the backend supervisor,
// IPC and the window together; each concern lives in its own module.

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { APP_HOST } from '../shared/ipc'
import { backendBinary, backendEnv, backendHome } from './backend/environment'
import { BackendConfig } from './backend/config'
import { BackendSkills } from './backend/skills'
import { BackendSupervisor } from './backend/supervisor'
import { registerIpc } from './ipc'
import { registerAppScheme, serveRenderer } from './protocol'
import { createMainWindow } from './window'

registerAppScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const home = backendHome()
  const backend = new BackendSupervisor({ binary: backendBinary(), home, allowOrigins: [APP_HOST], env: backendEnv })
  const config = new BackendConfig({ binary: backendBinary(), home, env: backendEnv, restart: () => backend.restart() })
  const skills = new BackendSkills({ binary: backendBinary(), home, restart: () => backend.restart(), trash: (path) => shell.trashItem(path) })

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })

  void app.whenReady().then(() => {
    // A packaged app takes its icon from the bundle; in development the Dock shows Electron's.
    if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
    serveRenderer(join(import.meta.dirname, '../renderer'))
    registerIpc(backend, config, skills, home)
    createMainWindow()
    void backend.start()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // On macOS the backend keeps running turns while no window is open.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Quitting (menu, Cmd+Q, or the SIGINT/SIGTERM Electron turns into a quit)
  // waits for the backend to stop.
  let stopping = false
  app.on('before-quit', (event) => {
    if (stopping) return
    stopping = true
    event.preventDefault()
    // Quit again from a fresh task: re-quitting from a microtask while this
    // quit unwinds hangs Electron when a window-all-closed listener exists.
    void backend.stop().finally(() => setTimeout(() => app.quit(), 0))
  })
}
