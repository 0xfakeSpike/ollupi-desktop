// The app's own browser: each thread has its tabs, which the person and
// that thread's agent share; the agent acts in the one the panel shows. A
// draft's tabs are kept as the draft's until its thread starts and takes
// them. The
// active tab is a view laid over its conversation's browser panel when that
// is open, and every tab keeps running when it is not. The tabs share one
// session, apart from the app's and persisted, so sites stay signed in; it
// tells sites it is Chrome, grants no device permissions and downloads
// nothing.
//
// The sidecar's browser provider asks for two things, by thread: what an
// action would do (its description and the tab's host, which permissions
// go by) and to do it, answered with the page as text.

import { errorMessage } from '@ollupi/client'
import { app, BrowserWindow, session, WebContentsView, type Rectangle } from 'electron'
import { EventEmitter, once } from 'node:events'
import type { BrowserState, BrowserTab } from '../../shared/ipc'
import { isWebPage, normalize } from './address'
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

/** A thread's tabs in order, and the one shown and acted in. thread
 * changes when a draft's thread takes them. */
interface Strip {
  thread: string
  tabs: WebContentsView[]
  active: WebContentsView | undefined
}

/** Emits 'state' (thread, BrowserState) as a thread's tabs change, 'used'
 * (thread) when the agent acts in one, 'visited' (url, title) when a tab
 * opens a page, its title '' until it names itself, and 'titled' (url,
 * title) when it does. */
export class AgentBrowser extends EventEmitter {
  private readonly strips = new Map<string, Strip>()
  /** The thread whose active tab the panel shows, and where. */
  private shown: { thread: string; bounds: Rectangle } | undefined

  state(thread: string): BrowserState {
    const strip = this.strips.get(thread)
    const tabs: BrowserTab[] = (strip?.tabs ?? []).map((v) => ({
      id: v.webContents.id,
      url: v.webContents.getURL(),
      title: v.webContents.getTitle(),
      loading: v.webContents.isLoading(),
    }))
    const wc = strip?.active?.webContents
    return {
      tabs,
      active: wc?.id,
      url: wc?.getURL() ?? '',
      title: wc?.getTitle() ?? '',
      loading: wc?.isLoading() ?? false,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    }
  }

  /** Shows a thread's active tab over its panel's area, in the window's
   * content, and hides every other; undefined hides it. */
  place(thread: string, bounds: Rectangle | undefined): void {
    if (bounds && bounds.width > 0 && bounds.height > 0) this.shown = { thread, bounds }
    else if (this.shown?.thread === thread) this.shown = undefined
    this.layAll()
  }

  /** Hides the tab on screen. The interface that showed it is loading
   * again, and will place its panel when it mounts. */
  hide(): void {
    this.shown = undefined
    this.layAll()
  }

  /** Loads an address in the active tab, opening one when there is none. */
  async open(thread: string, url: string): Promise<void> {
    const target = address(url)
    const view = this.strips.get(thread)?.active ?? this.newTab(thread)
    await load(view, target)
  }

  /** Opens an empty tab after the active one and makes it active. */
  newTab(thread: string): WebContentsView {
    const view = this.add(thread)
    this.changed(thread)
    return view
  }

  select(thread: string, id: number): void {
    const strip = this.strips.get(thread)
    const view = strip?.tabs.find((v) => v.webContents.id === id)
    if (!strip || !view) return
    strip.active = view
    this.layAll()
    this.changed(thread)
  }

  close(thread: string, id: number): void {
    this.strips
      .get(thread)
      ?.tabs.find((v) => v.webContents.id === id)
      ?.webContents.close()
  }

  /** Closes every tab of a thread that is going away and forgets them: a
   * tab is a page kept running in the window, and an archived or deleted
   * thread will not be looked at again. */
  forget(thread: string): void {
    const strip = this.strips.get(thread)
    if (!strip) return
    this.strips.delete(thread)
    if (this.shown?.thread === thread) this.shown = undefined
    const win = BrowserWindow.getAllWindows()[0]
    for (const view of strip.tabs) {
      // The strip is gone, so the tab's 'destroyed' handler finds no owner
      // and leaves the view in the window: take it out here.
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    this.changed(thread)
  }

  back(thread: string): void {
    this.strips.get(thread)?.active?.webContents.navigationHistory.goBack()
  }

  forward(thread: string): void {
    this.strips.get(thread)?.active?.webContents.navigationHistory.goForward()
  }

  reload(thread: string): void {
    this.strips.get(thread)?.active?.webContents.reload()
  }

  /** Gives the tabs of one owner, a draft, to a thread: after any it has,
   * the draft's active one shown. */
  handOver(from: string, to: string): void {
    const strip = this.strips.get(from)
    if (!strip || from === to) return
    this.strips.delete(from)
    const kept = this.strips.get(to)
    if (kept) {
      kept.tabs.push(...strip.tabs)
      kept.active = strip.active ?? kept.active
    } else {
      strip.thread = to
      this.strips.set(to, strip)
    }
    if (this.shown?.thread === from) this.shown = { thread: to, bounds: this.shown.bounds }
    this.layAll()
    this.changed(from)
    this.changed(to)
  }

  /** What an action would do in the thread's active tab. */
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

  /** Does an action in the thread's active tab, and answers with the page
   * as it then is: a link that opens a tab leaves the agent in it. */
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

  /** The thread's active tab with a page open in it. */
  private page(thread: string): Electron.WebContents {
    const wc = this.strips.get(thread)?.active?.webContents
    if (!wc || wc.isDestroyed() || !wc.getURL()) throw new Refusal('no page is open in this conversation; use navigate first')
    return wc
  }

  private changed(thread: string): void {
    this.emit('state', thread, this.state(thread))
  }

  private layAll(): void {
    for (const [thread, strip] of this.strips) {
      for (const view of strip.tabs) {
        const on = this.shown?.thread === thread && strip.active === view
        if (on) view.setBounds(this.shown!.bounds)
        view.setVisible(on)
      }
    }
  }

  /** A new tab in the app's window, after the thread's active one, made
   * active. */
  private add(thread: string): WebContentsView {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Refusal('the app window is closed, so the browser cannot be used')
    configure()
    let strip = this.strips.get(thread)
    if (!strip) {
      const created: Strip = { thread, tabs: [], active: undefined }
      strip = created
      this.strips.set(thread, created)
      win.on('closed', () => this.strips.delete(created.thread))
    }
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    // The strip the tab is in now: a draft's moves to its thread.
    const owner = () => [...this.strips.values()].find((s) => s.tabs.includes(view))
    win.contentView.addChildView(view)
    const at = strip.active ? strip.tabs.indexOf(strip.active) + 1 : strip.tabs.length
    strip.tabs.splice(at, 0, view)
    strip.active = view
    this.layAll()
    const wc = view.webContents
    // A link that opens a window opens in a new tab.
    wc.setWindowOpenHandler(({ url }) => {
      const now = owner()
      if (now && isWebPage(url)) void load(this.newTab(now.thread), url)
      return { action: 'deny' }
    })
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(event as 'did-stop-loading', () => {
        const now = owner()
        if (now) this.changed(now.thread)
      })
    }
    // A visit is the tab arriving at another address: reloading, or a page
    // rewriting its own address as it is, is none.
    let last = ''
    const arrived = (url: string, title: string) => {
      if (url === last) return
      last = url
      this.emit('visited', url, title)
    }
    wc.on('did-navigate', (_event, url) => arrived(url, ''))
    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => isMainFrame && arrived(url, named(wc)))
    wc.on('page-title-updated', (_event, title, explicitSet) => explicitSet && this.emit('titled', wc.getURL(), title))
    // Closed from the panel, or by the page itself.
    wc.once('destroyed', () => {
      const now = owner()
      if (!now) return
      const i = now.tabs.indexOf(view)
      now.tabs.splice(i, 1)
      if (!win.isDestroyed()) win.contentView.removeChildView(view)
      if (now.active === view) now.active = now.tabs[Math.min(i, now.tabs.length - 1)]
      this.layAll()
      this.changed(now.thread)
    })
    return view
  }
}

let configured = false

function configure(): void {
  if (configured) return
  configured = true
  const s = session.fromPartition(PARTITION)
  s.setUserAgent(chromeAgent(s.getUserAgent()))
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  s.on('will-download', (_event, item) => item.cancel())
}

/** The agent Chromium gives, without the app's and Electron's own tokens:
 * sites such as Google's sign-in turn away an agent that names an embedded
 * browser, and this one is the person's to sign in with. */
function chromeAgent(agent: string): string {
  return agent.replace(new RegExp(` (Electron|${app.getName()})/\\S+`, 'g'), '')
}

/** The page's own title; '' when it has none and the address stands in. */
function named(wc: Electron.WebContents): string {
  const title = wc.getTitle()
  return title === wc.getURL() ? '' : title
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

async function load(view: WebContentsView, url: string): Promise<void> {
  await view.webContents.loadURL(url).catch(() => {
    // A failed load shows its error page; the state says where it is.
  })
}

function address(url: string): string {
  try {
    return normalize(url)
  } catch (err) {
    throw new Refusal(errorMessage(err))
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
