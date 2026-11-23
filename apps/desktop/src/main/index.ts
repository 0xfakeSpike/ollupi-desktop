// Main process entry: app lifecycle only. It wires the backend supervisor,
// IPC and the window together; each concern lives in its own module.

import { app, net, shell } from 'electron'
import { join } from 'node:path'
import { APP_HOST, FIRST_PROFILE, IpcChannel } from '../shared/ipc'
import { backendBinary, backendEnv, backendHome } from './backend/environment'
import { BackendConfig } from './backend/config'
import { BackendSkills } from './backend/skills'
import { BackendSupervisor } from './backend/supervisor'
import { Bookmarks } from './browser/bookmarks'
import { AgentBrowser } from './browser/browser'
import { BrowserEndpoint } from './browser/endpoint'
import { History } from './browser/history'
import { Permissions } from './browser/permissions'
import { TempAttachments } from './attachments'
import { WorkspaceChanges } from './changes'
import { Terminals } from './terminal'
import { registerIpc } from './ipc'
import { registerAppScheme, serveRenderer } from './protocol'
import { Presence } from './presence/presence'
import { AppUpdater, bundleOf } from './update'
import { broadcast, createMainWindow, showMainWindow } from './window'
import { setAppIcon } from './appIcon'

registerAppScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const home = backendHome()
  const browser = new AgentBrowser(new Permissions(join(app.getPath('userData'), 'browser-permissions.json')))
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
  const backend = new BackendSupervisor({ binary: backendBinary(), home, profile: FIRST_PROFILE, allowOrigins: [APP_HOST], env, logFile: backendLog })
  const config = new BackendConfig({ binary: backendBinary(), home, env, restart: () => backend.restart() })
  const skills = new BackendSkills({ binary: backendBinary(), home, trash: (path) => shell.trashItem(path) })
  const updater = new AppUpdater({
    fetch: net.fetch,
    version: app.getVersion(),
    arch: process.arch,
    bundle: app.isPackaged ? bundleOf(app.getPath('exe')) : undefined,
    staging: join(app.getPath('userData'), 'update'),
    quit: () => app.quit(),
  })
  // Counts the time the person spends with a conversation on screen, and keeps
  // it in the backend's database beside the threads it belongs to. It writes
  // through a window's connection rather than holding one of its own.
  const presence = new Presence(backend, { send: (batch) => broadcast(IpcChannel.PresenceRows, batch) })

  app.on('second-instance', () => showMainWindow())
  // Closing the window hides it on macOS, until the app quits.
  const keepOnClose = () => process.platform === 'darwin' && !stopping

  void app.whenReady().then(() => {
    // A packaged app takes its icon from the bundle; in development the Dock
    // would show Electron's until the interface sets its theme's, so it takes
    // the brand's from the start.
    if (!app.isPackaged) setAppIcon('stone')
    serveRenderer(join(import.meta.dirname, '../renderer'))
    void attachments.clear()
    registerIpc(backend, config, skills, new WorkspaceChanges({ env: backendEnv, trash: (path) => shell.trashItem(path) }), browser, bookmarks, history, terminals, attachments, updater, presence, home, backendLog)
    // The interface places its panels as they mount; a window that is
    // loading again has none yet, so no tab stays over the empty screen.
    const newWindow = () => {
      const win = createMainWindow(keepOnClose)
      win.webContents.on('did-start-loading', () => browser.hide())
      return win
    }
    newWindow()
    updater.start()
    presence.start()
    // The backend's browser tools reach the endpoint from its start.
    void browserEndpoint.listen().then(() => backend.start())
    app.on('activate', () => {
      if (!showMainWindow()) newWindow()
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
    // The last stretches go to the backend before it stops, so the quit order
    // matters: presence first, then the backend and the history.
    void presence.stop().finally(() =>
      Promise.allSettled([backend.stop(), history.flush()]).finally(() => {
        updater.install()
        setTimeout(() => app.quit(), 0)
      }),
    )
  })
}
