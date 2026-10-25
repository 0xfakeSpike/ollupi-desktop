// Main process entry: app lifecycle only. It wires the backend supervisor,
// IPC and windows together; each concern lives in its own module.

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APP_HOST } from '../shared/ipc'
import { backendBinary, backendEnv, backendHome } from './backend/environment'
import { BackendSupervisor } from './backend/supervisor'
import { registerIpc } from './ipc'
import { registerAppScheme, serveRenderer } from './protocol'
import { createMainWindow } from './window'

registerAppScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const home = backendHome()
  const backend = new BackendSupervisor({
    binary: backendBinary(),
    home,
    allowOrigins: [APP_HOST],
    env: backendEnv,
  })

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })

  void app.whenReady().then(() => {
    serveRenderer(join(import.meta.dirname, '../renderer'))
    registerIpc(backend, home)
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

  let stopping = false
  app.on('before-quit', (event) => {
    if (stopping) return
    stopping = true
    event.preventDefault()
    // Quit again from a fresh task: re-quitting from a microtask while this
    // quit is unwinding hangs Electron when a window-all-closed listener exists.
    void backend.stop().finally(() => setTimeout(() => app.quit(), 0))
  })
}
