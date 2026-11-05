// Main process entry: app lifecycle only. It wires the backend supervisor,
// IPC and the window together; each concern lives in its own module.

import { app, net, shell } from 'electron'
import { join } from 'node:path'
import { APP_HOST } from '../shared/ipc'
import { backendBinary, backendEnv, backendHome } from './backend/environment'
import { BackendConfig } from './backend/config'
import { BackendSkills } from './backend/skills'
import { BackendSupervisor } from './backend/supervisor'
import { Bookmarks } from './browser/bookmarks'
import { AgentBrowser } from './browser/browser'
import { BrowserEndpoint } from './browser/endpoint'
import { History } from './browser/history'
import { TempAttachments } from './attachments'
import { WorkspaceChanges } from './changes'
import { Terminals } from './terminal'
import { registerIpc } from './ipc'
import { registerAppScheme, serveRenderer } from './protocol'
import { AppUpdater, bundleOf } from './update'
import { createMainWindow, showMainWindow } from './window'

registerAppScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const home = backendHome()
  const browser = new AgentBrowser()
  const browserEndpoint = new BrowserEndpoint(browser)
  const bookmarks = new Bookmarks(join(app.getPath('userData'), 'bookmarks.json'), join(app.getPath('appData'), 'Google', 'Chrome'))
  const history = new History(join(app.getPath('userData'), 'history.json'))
  // Every page a tab opens, the person's or an agent's.
  const noted = (work: Promise<void>) => void work.catch((err: unknown) => console.error('browser history not kept', err))
  browser.on('visited', (url: string, title: string) => noted(history.visit(url, title)))
  browser.on('titled', (url: string, title: string) => noted(history.title(url, title)))
  const terminals = new Terminals()
  const attachments = new TempAttachments(join(app.getPath('temp'), 'Ollupi', 'attachments'))
  // Every start and check of the backend reaches the app's browser.
  const env = async () => ({ ...(await backendEnv()), ...browserEndpoint.env() })
  const backendLog = join(app.getPath('logs'), 'backend.log')
  const backend = new BackendSupervisor({ binary: backendBinary(), home, allowOrigins: [APP_HOST], env, logFile: backendLog })
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

  app.on('second-instance', () => showMainWindow())
  // Closing the window hides it on macOS, until the app quits.
  const keepOnClose = () => process.platform === 'darwin' && !stopping

  void app.whenReady().then(() => {
    // A packaged app takes its icon from the bundle; in development the Dock shows Electron's.
    if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
    serveRenderer(join(import.meta.dirname, '../renderer'))
    void attachments.clear()
    registerIpc(backend, config, skills, new WorkspaceChanges({ env: backendEnv, trash: (path) => shell.trashItem(path) }), browser, bookmarks, history, terminals, attachments, updater, home, backendLog)
    createMainWindow(keepOnClose)
    updater.start()
    // The backend's browser tools reach the endpoint from its start.
    void browserEndpoint.listen().then(() => backend.start())
    app.on('activate', () => {
      if (!showMainWindow()) createMainWindow(keepOnClose)
    })
  })

  // On macOS the backend keeps running turns while no window shows.
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
    terminals.closeAll()
    void Promise.allSettled([backend.stop(), history.flush()]).finally(() => {
      updater.install()
      setTimeout(() => app.quit(), 0)
    })
  })
}
