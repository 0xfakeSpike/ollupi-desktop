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
    // Centred on the screen panel's 40px header, which sits 8px down.
    trafficLightPosition: { x: 16, y: 21 },
    // theme.css --ol-ground, shown before the renderer paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a19' : '#f7f6f3',
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
