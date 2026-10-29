// Main process entry: app lifecycle only. It wires the backend supervisor,
// IPC and the window together; each concern lives in its own module.

import { app, BrowserWindow, net, shell } from 'electron'
import { join } from 'node:path'
import { APP_HOST } from '../shared/ipc'
import { backendBinary, backendEnv, backendHome } from './backend/environment'
import { BackendConfig } from './backend/config'
import { BackendSkills } from './backend/skills'
import { BackendSupervisor } from './backend/supervisor'
import { AgentBrowser } from './browser/browser'
import { BrowserEndpoint } from './browser/endpoint'
import { WorkspaceChanges } from './changes'
import { registerIpc } from './ipc'
import { registerAppScheme, serveRenderer } from './protocol'
import { AppUpdater, bundleOf } from './update'
import { createMainWindow } from './window'

registerAppScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const home = backendHome()
  const browser = new AgentBrowser()
  const browserEndpoint = new BrowserEndpoint(browser)
  // Every start and check of the backend reaches the app's browser.
  const env = async () => ({ ...(await backendEnv()), ...browserEndpoint.env() })
  const backend = new BackendSupervisor({ binary: backendBinary(), home, allowOrigins: [APP_HOST], env })
  const config = new BackendConfig({ binary: backendBinary(), home, env, restart: () => backend.restart() })
  const skills = new BackendSkills({ binary: backendBinary(), home, restart: () => backend.restart(), trash: (path) => shell.trashItem(path) })
  const updater = new AppUpdater({
    fetch: net.fetch,
    version: app.getVersion(),
    arch: process.arch,
    bundle: app.isPackaged ? bundleOf(app.getPath('exe')) : undefined,
    staging: join(app.getPath('userData'), 'update'),
    quit: () => app.quit(),
  })

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })

  void app.whenReady().then(() => {
    // A packaged app takes its icon from the bundle; in development the Dock shows Electron's.
    if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
    serveRenderer(join(import.meta.dirname, '../renderer'))
    registerIpc(backend, config, skills, new WorkspaceChanges({ env: backendEnv }), browser, updater, home)
    createMainWindow()
    updater.start()
    // The backend's browser tools reach the endpoint from its start.
    void browserEndpoint.listen().then(() => backend.start())
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // On macOS the backend keeps running turns while no window is open.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Quitting (menu, Cmd+Q, or the SIGINT/SIGTERM Electron turns into a quit)
  // waits for the backend to stop, then installs a downloaded update.
  let stopping = false
  app.on('before-quit', (event) => {
    if (stopping) return
    stopping = true
    event.preventDefault()
    // Quit again from a fresh task: re-quitting from a microtask while this
    // quit unwinds hangs Electron when a window-all-closed listener exists.
    void backend.stop().finally(() => {
      updater.install()
      setTimeout(() => app.quit(), 0)
    })
  })
}
