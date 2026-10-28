import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { rendererURL } from './protocol'

export function createMainWindow(): BrowserWindow {
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
