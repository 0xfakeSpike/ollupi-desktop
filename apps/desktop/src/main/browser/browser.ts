// The app's own browser: a tab per thread, which the person and that
// thread's agent share. A tab is a view laid over its conversation's
// browser panel when that is open, and keeps running when it is not. The
// tabs share one session, apart from the app's and persisted, so sites stay
// signed in; it grants no device permissions and downloads nothing.
//
// The sidecar's browser provider asks for two things, by thread: what an
// action would do (its description and the tab's host, which permissions
// go by) and to do it, answered with the page as text.

import { BrowserWindow, session, WebContentsView, type Rectangle } from 'electron'
import { EventEmitter, once } from 'node:events'
import type { BrowserState } from '../../shared/ipc'
import { normalize } from './address'
import { clickScript, describeScript, focusScript, locateScript, scrollScript, snapshotScript, WORLD } from './page'

const PARTITION = 'persist:browser'
/** About 10k tokens of page. */
const SNAPSHOT_LIMIT = 40_000
const LOAD_TIMEOUT = 15_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** An action that cannot be done, worded for the agent: a stale ref, no
 * page open. */
export class Refusal extends Error {}

/** What an action does, as permissions and approvals see it. */
export interface Description {
  host: string
  text: string
}

const blank: BrowserState = { url: '', title: '', loading: false, canGoBack: false, canGoForward: false }

/** Emits 'state' (thread, BrowserState) as a tab changes, and 'used'
 * (thread) when the agent acts in it. */
export class AgentBrowser extends EventEmitter {
  private readonly tabs = new Map<string, WebContentsView>()
  /** The thread whose tab the panel shows, and where. */
  private shown: { thread: string; bounds: Rectangle } | undefined

  state(thread: string): BrowserState {
    const wc = this.tabs.get(thread)?.webContents
    if (!wc || wc.isDestroyed()) return blank
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    }
  }

  /** Shows a thread's tab over its panel's area, in the window's content,
   * and hides every other; undefined hides it. */
  place(thread: string, bounds: Rectangle | undefined): void {
    if (bounds && bounds.width > 0 && bounds.height > 0) this.shown = { thread, bounds }
    else if (this.shown?.thread === thread) this.shown = undefined
    for (const [t, view] of this.tabs) this.lay(t, view)
  }

  async open(thread: string, url: string): Promise<void> {
    const target = address(url)
    await this.tab(thread).webContents.loadURL(target).catch(() => {
      // A failed load shows its error page; the state says where it is.
    })
  }

  back(thread: string): void {
    this.tabs.get(thread)?.webContents.navigationHistory.goBack()
  }

  forward(thread: string): void {
    this.tabs.get(thread)?.webContents.navigationHistory.goForward()
  }

  reload(thread: string): void {
    this.tabs.get(thread)?.webContents.reload()
  }

  /** What an action would do in the thread's tab. */
  async describe(thread: string, action: string, args: Record<string, unknown>): Promise<Description> {
    if (action === 'navigate') {
      const url = address(text(args, 'url'))
      return { host: new URL(url).host, text: `Open ${url}` }
    }
    const wc = this.page(thread)
    const host = new URL(wc.getURL()).host
    switch (action) {
      case 'click':
        return { host, text: `Click ${await element(wc, text(args, 'ref'))} on ${host}` }
      case 'type': {
        const typed = typeof args.text === 'string' ? args.text : ''
        const enter = args.submit === true ? ' and press Enter' : ''
        return { host, text: `Type "${typed}" into ${await element(wc, text(args, 'ref'))}${enter} on ${host}` }
      }
      case 'press_key':
        return { host, text: `Press ${text(args, 'key')} on ${host}` }
      case 'back':
        if (!wc.navigationHistory.canGoBack()) throw new Refusal('there is no earlier page in this tab')
        return { host, text: `Go back from ${host}` }
      default:
        throw new Refusal(`${action} acts on no site`)
    }
  }

  /** Does an action in the thread's tab, and answers with the page as it
   * then is. */
  async call(thread: string, action: string, args: Record<string, unknown>): Promise<string> {
    this.emit('used', thread)
    switch (action) {
      case 'navigate':
        await this.open(thread, text(args, 'url'))
        break
      case 'snapshot':
        break
      case 'click':
        await this.click(thread, text(args, 'ref'))
        break
      case 'type': {
        const wc = this.page(thread)
        if (typeof args.text !== 'string') throw new Refusal('text is required')
        await act(wc, focusScript(ref(text(args, 'ref'))))
        wc.insertText(args.text)
        if (args.submit === true) key(wc, 'Enter')
        break
      }
      case 'press_key':
        key(this.page(thread), text(args, 'key'))
        break
      case 'scroll':
        await run(this.page(thread), scrollScript(args.direction !== 'up'))
        break
      case 'back':
        this.page(thread).navigationHistory.goBack()
        break
      default:
        throw new Refusal(`no action named ${action}`)
    }
    return read(this.page(thread))
  }

  private async click(thread: string, r: string): Promise<void> {
    const wc = this.page(thread)
    if (this.shown?.thread !== thread) {
      // A tab not on screen takes no input events.
      return act(wc, clickScript(ref(r)))
    }
    const at = await run<{ x: number; y: number } | { error: string }>(wc, locateScript(ref(r)))
    if ('error' in at) throw new Refusal(at.error)
    // Real input, so the page sees a person's click.
    wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y })
    wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }

  /** The thread's tab with a page open in it. */
  private page(thread: string): Electron.WebContents {
    const wc = this.tabs.get(thread)?.webContents
    if (!wc || wc.isDestroyed() || !wc.getURL()) throw new Refusal('no page is open in this conversation; use navigate first')
    return wc
  }

  private lay(thread: string, view: WebContentsView): void {
    const on = this.shown?.thread === thread
    if (on) view.setBounds(this.shown!.bounds)
    view.setVisible(on)
  }

  /** The thread's tab, made in the app's window on first use. */
  private tab(thread: string): WebContentsView {
    const known = this.tabs.get(thread)
    if (known && !known.webContents.isDestroyed()) return known
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Refusal('the app window is closed, so the browser cannot be used')
    configure()
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    win.contentView.addChildView(view)
    this.lay(thread, view)
    const wc = view.webContents
    // A link that opens a window opens in the same tab.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url)
      return { action: 'deny' }
    })
    const changed = () => this.emit('state', thread, this.state(thread))
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(event as 'did-stop-loading', changed)
    }
    win.on('closed', () => this.tabs.delete(thread))
    this.tabs.set(thread, view)
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

/** The page once it has settled: its title, address and snapshot. */
async function read(wc: Electron.WebContents): Promise<string> {
  await sleep(200)
  if (wc.isLoading()) await Promise.race([once(wc, 'did-stop-loading'), sleep(LOAD_TIMEOUT)])
  const snapshot = await run<string>(wc, snapshotScript(SNAPSHOT_LIMIT))
  return `${wc.getTitle()}\n${wc.getURL()}\n\n${snapshot || '(the page shows nothing)'}`
}

/** An element as a person would name it: its role and name. */
async function element(wc: Electron.WebContents, r: string): Promise<string> {
  const el = await run<{ role: string; name: string } | { error: string }>(wc, describeScript(ref(r)))
  if ('error' in el) throw new Refusal(el.error)
  return el.name ? `${el.role} "${el.name}"` : el.role
}

function run<T>(wc: Electron.WebContents, code: string): Promise<T> {
  return wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]) as Promise<T>
}

/** Runs a page script that answers {} or why it could not act. */
async function act(wc: Electron.WebContents, code: string): Promise<void> {
  const done = await run<{ error?: string }>(wc, code)
  if (done.error) throw new Refusal(done.error)
}

function key(wc: Electron.WebContents, keyCode: string): void {
  wc.sendInputEvent({ type: 'keyDown', keyCode })
  if ([...keyCode].length === 1) wc.sendInputEvent({ type: 'char', keyCode })
  wc.sendInputEvent({ type: 'keyUp', keyCode })
}

function address(url: string): string {
  try {
    return normalize(url)
  } catch (err) {
    throw new Refusal(err instanceof Error ? err.message : String(err))
  }
}

function text(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v) throw new Refusal(`${key} is required`)
  return v
}

/** Refs are the snapshot's own, e1, e2 and so on. */
function ref(r: string): string {
  if (!/^e\d+$/.test(r)) throw new Refusal(`${r} is not a ref from a snapshot`)
  return r
}
