import { BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { isWebPage } from './browser/address'
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#f9f9f7',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Chromium's PDF viewer, which the files panel shows a PDF in.
      plugins: true,
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
    if (isWebPage(url)) void shell.openExternal(url)
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
  watchTheInterface(win)
  return win
}

/** A renderer that stops answering leaves a window that takes clicks and
 * does nothing, and no notice inside it can help: the page is the thing
 * stuck. The agent, the conversations and their browser tabs run outside
 * it, so reloading the interface reconnects them. Ask first — the page may
 * be finishing long work and recover — but reload a renderer that is gone
 * without asking, since there is nothing left on screen to look at. */
function watchTheInterface(win: BrowserWindow): void {
  let asking = false
  let reloadedAt = 0
  let askAgain: ReturnType<typeof setTimeout> | undefined
  const stopAsking = () => {
    clearTimeout(askAgain)
    askAgain = undefined
  }
  const ask = () => {
    if (asking) return
    asking = true
    // A hang names its process for whoever reads the log afterwards: the
    // page cannot write one while it is stuck.
    console.error('the interface stopped responding', win.webContents.getOSProcessId())
    void dialog
      .showMessageBox({
        type: 'warning',
        message: 'The interface stopped responding.',
        detail: 'The agent and its conversations keep running. Reloading reconnects the interface and returns to this conversation.',
        buttons: ['Reload interface', 'Wait'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        asking = false
        if (response === 0) {
          stopAsking()
          win.webContents.reload()
        } else {
          // Waiting is a hope, not an answer: ask again if it does not come
          // true.
          askAgain = setTimeout(ask, 60_000)
        }
      })
  }
  win.webContents.on('unresponsive', ask)
  win.webContents.on('responsive', stopAsking)
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error('the interface is gone', details.reason, details.exitCode)
    // Reloading is the only way back; one that dies again straight away is
    // not helped by reloading it again.
    if (Date.now() - reloadedAt < 30_000) return
    reloadedAt = Date.now()
    win.webContents.reload()
  })
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
