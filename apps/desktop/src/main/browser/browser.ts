// The app's own browser: one page the person and the agent share. It is a
// view laid over the conversation's browser panel when that is open, and
// keeps running when it is not. Its session is apart from the app's and
// persists, so sites stay signed in; it grants no device permissions and
// downloads nothing.

import { BrowserWindow, session, WebContentsView, type Rectangle } from 'electron'
import { EventEmitter, once } from 'node:events'
import type { BrowserState } from '../../shared/ipc'
import { normalize } from './address'
import { clickScript, focusScript, locateScript, scrollScript, snapshotScript, WORLD } from './page'

const PARTITION = 'persist:browser'
/** About 10k tokens of page. */
const SNAPSHOT_LIMIT = 40_000
const LOAD_TIMEOUT = 15_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Emits 'state' (BrowserState) as the page changes, and 'used' when the
 * agent acts on it. */
export class AgentBrowser extends EventEmitter {
  private view: WebContentsView | undefined
  private shown = false

  state(): BrowserState {
    const wc = this.view?.webContents
    if (!wc || wc.isDestroyed()) return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false }
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    }
  }

  /** Where the panel shows the page, in the window's content; undefined
   * hides it. */
  place(bounds: Rectangle | undefined): void {
    const view = this.ensure()
    this.shown = !!bounds && bounds.width > 0 && bounds.height > 0
    if (this.shown) view.setBounds(bounds!)
    view.setVisible(this.shown)
  }

  async open(url: string): Promise<void> {
    await this.ensure().webContents.loadURL(normalize(url)).catch(() => {
      // A failed load shows its error page; the state says where it is.
    })
  }

  back(): void {
    this.ensure().webContents.navigationHistory.goBack()
  }

  forward(): void {
    this.ensure().webContents.navigationHistory.goForward()
  }

  reload(): void {
    this.ensure().webContents.reload()
  }

  // What the agent does, each answered with the page as it then is.

  async navigate(url: string): Promise<string> {
    this.emit('used')
    await this.open(url)
    return this.read()
  }

  async goBack(): Promise<string> {
    this.emit('used')
    this.back()
    return this.read()
  }

  async snapshot(): Promise<string> {
    this.emit('used')
    return this.read()
  }

  async click(ref: string): Promise<string> {
    this.emit('used')
    const wc = this.ensure().webContents
    if (this.shown) {
      const at = await this.run<{ x: number; y: number } | { error: string }>(locateScript(checked(ref)))
      if ('error' in at) throw new Error(at.error)
      // Real input, so the page sees a person's click.
      wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y })
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 })
    } else {
      const done = await this.run<{ error?: string }>(clickScript(checked(ref)))
      if (done.error) throw new Error(done.error)
    }
    return this.read()
  }

  async type(ref: string, text: string, submit: boolean): Promise<string> {
    this.emit('used')
    const focused = await this.run<{ error?: string }>(focusScript(checked(ref)))
    if (focused.error) throw new Error(focused.error)
    this.ensure().webContents.insertText(text)
    if (submit) this.key('Enter')
    return this.read()
  }

  async press(key: string): Promise<string> {
    this.emit('used')
    this.key(key)
    return this.read()
  }

  async scroll(down: boolean): Promise<string> {
    this.emit('used')
    await this.run(scrollScript(down))
    return this.read()
  }

  /** The page once it has settled: its title, address and snapshot. */
  private async read(): Promise<string> {
    const wc = this.ensure().webContents
    await sleep(200)
    if (wc.isLoading()) await Promise.race([once(wc, 'did-stop-loading'), sleep(LOAD_TIMEOUT)])
    if (!wc.getURL()) return 'No page is open. Use navigate to open one.'
    const snapshot = await this.run<string>(snapshotScript(SNAPSHOT_LIMIT))
    return `${wc.getTitle()}\n${wc.getURL()}\n\n${snapshot || '(the page shows nothing)'}`
  }

  private key(keyCode: string): void {
    const wc = this.ensure().webContents
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if ([...keyCode].length === 1) wc.sendInputEvent({ type: 'char', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
  }

  private run<T>(code: string): Promise<T> {
    return this.ensure().webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]) as Promise<T>
  }

  /** The view, in the app's window; made on first use. */
  private ensure(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('the app window is closed, so the browser cannot be used')
    configure()
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    view.setVisible(false)
    win.contentView.addChildView(view)
    const wc = view.webContents
    // A link that opens a window opens in the same page.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url)
      return { action: 'deny' }
    })
    const changed = () => this.emit('state', this.state())
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(event as 'did-stop-loading', changed)
    }
    win.on('closed', () => {
      this.view = undefined
      this.shown = false
    })
    this.view = view
    this.shown = false
    return view
  }
}

let configured = false

function configure(): void {
  if (configured) return
  configured = true
  const s = session.fromPartition(PARTITION)
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  s.on('will-download', (_event, item) => item.cancel())
}

/** Refs are the snapshot's own, e1, e2 and so on. */
function checked(ref: string): string {
  if (!/^e\d+$/.test(ref)) throw new Error(`${ref} is not a ref from a snapshot`)
  return ref
}
