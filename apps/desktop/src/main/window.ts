import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { rendererURL } from './protocol'

/** keepOnClose: whether closing the window only hides it. On macOS the app
 * lives on without windows, and a hidden window keeps the renderer, its
 * connection and what it tells the person (notifications, the Dock badge),
 * the conversations' browser tabs too; it shows again from the Dock. Only
 * quitting closes it. */
export function createMainWindow(keepOnClose: () => boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Ollupi',
    titleBarStyle: 'hiddenInset',
    // Centred on the screen's 40px header at the top of the window.
    trafficLightPosition: { x: 16, y: 13 },
    // The default palette's --ol-ground (theme.css), shown before the renderer paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b191a' : '#f7f5f4',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', (event) => {
    if (!keepOnClose()) return
    event.preventDefault()
    // A full-screen window hidden as it is leaves its empty Space behind.
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide())
      win.setFullScreen(false)
    } else {
      win.hide()
    }
  })

  // Links open in the user's browser; the window never navigates away.
  const external = (url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    external(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    external(url)
  })

  void win.loadURL(process.env.ELECTRON_RENDERER_URL ?? rendererURL)
  return win
}

/** Brings the main window back, hidden or minimized; false when there is
 * none. */
export function showMainWindow(): boolean {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
}
