// The app's own browser: each thread has its tabs, which the person and
// that thread's agent share; the agent acts in the one the panel shows. A
// draft's tabs are kept as the draft's until its thread starts and takes
// them. The
// active tab is a view laid over its conversation's browser panel when that
// is open, and every tab keeps running when it is not. The tabs share one
// session, apart from the app's and persisted, so sites stay signed in; it
// tells sites it is Chrome, grants no device permissions, and asks where a
// page's download goes, as a browser does.
//
// The sidecar's browser provider asks for two things, by thread: what an
// action would do (its description and the tab's host, which permissions
// go by) and to do it, answered with the page as text. Playwright does the
// agent's actions and reads the page (./playwright).

import { errorMessage } from '@ollupi/client'
import { app, BrowserWindow, session, WebContentsView, type Rectangle } from 'electron'
import { EventEmitter, once } from 'node:events'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright-core'
import type { BrowserDownload, BrowserState, BrowserTab } from '../../shared/ipc'
import { isWebPage, normalize } from './address'
import { Pages, playwright, type Size } from './playwright'

const PARTITION = 'persist:browser'
/** About 10k tokens of page: a snapshot longer than this is read by pages. */
const SNAPSHOT_PAGE = 40_000
const LOAD_TIMEOUT = 15_000
/** The size a tab off screen is laid out at when no panel has been shown. */
const PANEL_SIZE: Size = { width: 1280, height: 800 }

/** An action that cannot be done, worded for the agent: a stale ref, no
 * page open. */
export class Refusal extends Error {
  override name = 'Refusal'
}

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
 * opens a page, its title '' until it names itself, 'titled' (url, title)
 * when it does, and 'downloaded' (thread, BrowserDownload) when a page's
 * download ends, with where it went or that it did not finish. */
export class AgentBrowser extends EventEmitter {
  private readonly strips = new Map<string, Strip>()
  /** The thread whose active tab the panel shows, and where. */
  private shown: { thread: string; bounds: Rectangle } | undefined
  /** Whether the tabs' session's downloads are watched. */
  private watching = false
  /** The panel's size when last shown: a tab off screen is laid out at it
   * while the agent acts there, as the person would see it. */
  private panel: Size = PANEL_SIZE
  private readonly pages = new Pages()
  /** Each tab's latest snapshot, in the pages it is read by. */
  private readonly snapshots = new WeakMap<Electron.WebContents, string[]>()

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
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const placed = inWindow(bounds)
      this.shown = { thread, bounds: placed }
      this.panel = { width: placed.width, height: placed.height }
    } else if (this.shown?.thread === thread) this.shown = undefined
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
    const wc = this.tab(thread)
    const host = new URL(wc.getURL()).host
    switch (action) {
      case 'click':
        return { host, text: `Click ${this.element(wc, ref(args))} on ${host}` }
      case 'type': {
        const typed = typeof args.text === 'string' ? args.text : ''
        const enter = args.submit === true ? ' and press Enter' : ''
        return { host, text: `Type "${typed}" into ${this.element(wc, ref(args))}${enter} on ${host}` }
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
        return this.read(thread, pageNumber(args))
      case 'click': {
        const r = ref(args)
        await this.act(thread, async (page) => (await located(page, r)).click())
        break
      }
      case 'type': {
        const r = ref(args)
        const typed = args.text
        if (typeof typed !== 'string') throw new Refusal('text is required')
        await this.act(thread, async (page) => {
          const field = await located(page, r)
          await field.fill(typed)
          if (args.submit === true) await field.press('Enter')
        })
        break
      }
      case 'press_key': {
        const key = text(args, 'key')
        await this.act(thread, (page) => page.keyboard.press(key))
        break
      }
      case 'scroll':
        await this.act(thread, (page) => scroll(page, args.direction === 'up'))
        break
      case 'back':
        // The page that comes back is waited for as any page is, by read.
        await this.act(thread, (page) => page.goBack({ waitUntil: 'commit' }))
        break
      default:
        throw new Refusal(`no action named ${action}`)
    }
    return this.read(thread)
  }

  /** Does an action in the thread's active tab. What goes wrong on the
   * page, such as a stale ref or an element that never becomes ready, is
   * the agent's to read. */
  private async act(thread: string, action: (page: Page) => Promise<unknown>): Promise<void> {
    await this.pages.act(this.tab(thread), this.offscreen(thread), (page) =>
      action(page).catch((err: unknown) => {
        if (err instanceof Refusal) throw err
        throw new Refusal(told(errorMessage(err)), { cause: err })
      }),
    )
  }

  /** The thread's active tab as text: a new snapshot, or a page of the
   * latest one by its number. Every page of a snapshot gives refs that work
   * until the next one. */
  private async read(thread: string, n?: number): Promise<string> {
    if (n !== undefined) {
      const wc = this.tab(thread)
      const pages = this.snapshots.get(wc)
      if (!pages) throw new Refusal('there is no snapshot of this page yet; take one without page')
      if (n > pages.length) throw new Refusal(`the snapshot has ${pages.length} page${pages.length === 1 ? '' : 's'}`)
      return shown(wc, pages, n)
    }
    await this.opening(thread)
    const wc = this.tab(thread)
    const { errors } = await playwright()
    const snapshot = await this.pages.act(wc, this.offscreen(thread), async (page) => {
      try {
        await page.waitForLoadState('load', { timeout: LOAD_TIMEOUT })
      } catch (err) {
        // A page still loading is read as far as it has come.
        if (!(err instanceof errors.TimeoutError)) throw err
      }
      return page.ariaSnapshot({ mode: 'ai' })
    })
    const pages = paged(snapshot, SNAPSHOT_PAGE)
    this.snapshots.set(wc, pages)
    return shown(wc, pages, 1)
  }

  /** An element as the latest snapshot names it, as the agent saw it:
   * its role and name. Asking the page instead would take a snapshot of
   * the element, and a snapshot gives the page new refs. */
  private element(wc: Electron.WebContents, r: string): string {
    const line = this.snapshots
      .get(wc)
      ?.flatMap((page) => page.split('\n'))
      .find((l) => l.includes(`[ref=${r}]`))
    if (!line) throw new Refusal(`no element ${r} in the latest snapshot; take a new snapshot`)
    // A snapshot's line: - role "name" [attributes]: text
    const [, role = 'element', name] = /^\s*- ([\w-]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(line) ?? []
    return name ? `${role} "${name}"` : role
  }

  /** Waits for the thread's active tab to have its first page, when a
   * link has just opened it: the tab is there before its page is. */
  private async opening(thread: string): Promise<void> {
    const wc = this.strips.get(thread)?.active?.webContents
    if (!wc || wc.isDestroyed() || wc.getURL() || !wc.isLoading()) return
    try {
      await once(wc, 'did-stop-loading', { signal: AbortSignal.timeout(LOAD_TIMEOUT) })
    } catch (err) {
      // Still opening: tab() says there is no page yet.
      if (!(err instanceof Error && err.name === 'AbortError')) throw err
    }
  }

  /** The thread's active tab with a page open in it. */
  private tab(thread: string): Electron.WebContents {
    const wc = this.strips.get(thread)?.active?.webContents
    if (!wc || wc.isDestroyed() || !wc.getURL()) throw new Refusal('no page is open in this conversation; use navigate first')
    return wc
  }

  /** The size the thread's tab is laid out at while the agent acts in it,
   * when it is not the one on screen. */
  private offscreen(thread: string): Size | undefined {
    return this.shown?.thread === thread ? undefined : this.panel
  }

  private changed(thread: string): void {
    this.emit('state', thread, this.state(thread))
  }

  /** Watches the tabs' session for downloads, once: a page's download asks
   * where to save it, as a browser does, and the strip whose tab started it
   * hears where it went, or that it did not finish. */
  private watchDownloads(): void {
    if (this.watching) return
    this.watching = true
    session.fromPartition(PARTITION).on('will-download', (_event, item, wc) => {
      const strip = () => [...this.strips.values()].find((s) => s.tabs.some((v) => v.webContents === wc))
      const started = strip()
      item.setSaveDialogOptions({ defaultPath: join(app.getPath('downloads'), item.getFilename()) })
      item.once('done', (_done, state) => {
        if (state === 'cancelled') return
        const thread = (strip() ?? started)?.thread
        if (!thread) return
        const name = item.getFilename()
        this.emit('downloaded', thread, state === 'completed' ? { name, path: item.getSavePath() } : { name })
      })
    })
  }

  private layAll(): void {
    for (const [thread, strip] of this.strips) {
      for (const view of strip.tabs) {
        const on = this.shown?.thread === thread && strip.active === view
        // A page that is not shown is given no room at all, not only hidden:
        // a view hidden but still laid out has kept painting over the
        // conversation, at the place and size it was given last.
        view.setBounds(on ? this.shown!.bounds : { x: 0, y: 0, width: 0, height: 0 })
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
    // A download asks where to save it, and the panel hears where it went.
    // Cancelling the dialog in it is the person's answer, not a failure.
    this.watchDownloads()
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
}

/** The page's bounds in the window's own coordinates. The interface measures
 * in its pixels, and a zoomed interface's pixel is worth more than the
 * window's: placed as they come, the page sits too small and too far left. */
function inWindow(r: Rectangle): Rectangle {
  const zoom = BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor() ?? 1
  if (zoom === 1) return r
  return { x: Math.round(r.x * zoom), y: Math.round(r.y * zoom), width: Math.round(r.width * zoom), height: Math.round(r.height * zoom) }
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

/** A snapshot cut into pages of at most size characters, at line ends
 * where it can be. */
export function paged(snapshot: string, size: number): string[] {
  const pages: string[] = []
  let page = ''
  for (const line of snapshot.split('\n')) {
    for (let at = 0; at < Math.max(line.length, 1); at += size) {
      const piece = line.slice(at, at + size)
      if (page && page.length + 1 + piece.length > size) {
        pages.push(page)
        page = ''
      }
      page = page ? `${page}\n${piece}` : piece
    }
  }
  pages.push(page)
  return pages
}

/** A page of a tab's snapshot, under the tab's title and address. */
function shown(wc: Electron.WebContents, pages: string[], n: number): string {
  const body = pages[n - 1] || '(the page shows nothing)'
  const more = n < pages.length ? `; snapshot with page ${n + 1} reads on` : ''
  const of = pages.length > 1 ? `\n\n[page ${n} of ${pages.length} of this snapshot${more}]` : ''
  return `${wc.getTitle()}\n${wc.getURL()}\n\n${body}${of}`
}

/** The element a ref names, if the page has it: a ref of an earlier
 * snapshot names nothing, and Playwright would wait its whole timeout for
 * it to appear. */
async function located(page: Page, r: string): Promise<Locator> {
  const element = page.getByRef(r)
  if ((await element.count()) === 0) throw new Refusal(`no element ${r} on the page now; take a new snapshot`)
  return element
}

/** What went wrong in an action, for the agent: Playwright's message and
 * the start of its call log, which says what it waited for. */
function told(message: string): string {
  const lines = message.split('\n')
  return lines.length > 12 ? [...lines.slice(0, 12), '…'].join('\n') : message
}

/** Scrolls what is under the middle of the page by most of a screen, as a
 * wheel does: a list that scrolls on its own scrolls, not only the page. */
async function scroll(page: Page, up: boolean): Promise<void> {
  const [width, height] = (await page.evaluate('[innerWidth, innerHeight]')) as [number, number]
  await page.mouse.move(width / 2, height / 2)
  await page.mouse.wheel(0, Math.round(height * 0.8) * (up ? -1 : 1))
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

/** The page of the latest snapshot asked for, if one is. */
function pageNumber(args: Record<string, unknown>): number | undefined {
  if (args.page === undefined) return undefined
  if (!Number.isInteger(args.page) || (args.page as number) < 1) throw new Refusal('page is a number from 1')
  return args.page as number
}

function text(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v) throw new Refusal(`${key} is required`)
  return v
}

/** Refs are the snapshot's own: e1, e2 and so on, f1e3 in a frame. */
function ref(args: Record<string, unknown>): string {
  const r = text(args, 'ref')
  if (!/^(f\d+)?e\d+$/.test(r)) throw new Refusal(`${r} is not a ref from a snapshot`)
  return r
}
