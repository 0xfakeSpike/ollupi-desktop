// The app's own browser: each thread has its tabs, which the person and
// that thread's agent share; the agent acts in the one the panel shows. A
// draft's tabs are kept as the draft's until its thread starts and takes
// them. The active tab is a view laid over its conversation's browser panel
// when that is open, and every tab keeps running when it is not. The tabs
// share one session, apart from the app's and persisted, so sites stay signed
// in; it tells sites it is Chrome, asks the person in the panel before a page
// uses a permission of the Mac, keeping the answer for that site apart from
// the device permissions, and asks where a page's download goes, as a browser
// does.
//
// The sidecar's browser provider asks for two things, by thread: what an
// action would do (its description and the tab's host, which permissions
// go by) and to do it, answered with the page as text. Playwright does the
// agent's actions and reads the page (./playwright).

import { errorMessage } from '@ollupi/client'
import { app, BrowserWindow, session, WebContentsView, type Rectangle } from 'electron'
import { EventEmitter, once } from 'node:events'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElementHandle, Locator, Page } from 'playwright-core'
import type { BrowserDownload, BrowserPermission, BrowserState, BrowserTab } from '../../shared/ipc'
import { isWebPage, normalize, START_PAGE } from './address'
import { asking, type Permissions } from './permissions'
import { Pages, playwright, type Size } from './playwright'

const PARTITION = 'persist:browser'
/** About 10k tokens of page: a snapshot longer than this is read by pages. */
const SNAPSHOT_PAGE = 40_000
const LOAD_TIMEOUT = 15_000
/** How long a page waits for the person to answer a permission: no answer is
 * no, as a browser's notice that is left alone. */
const ASK_TIMEOUT = 60_000
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
 * when it does, 'downloaded' (thread, BrowserDownload) when a page's
 * download ends, with where it went or that it did not finish, and
 * 'permission' (thread, BrowserPermission) when a page asks to use something
 * of the Mac, which the panel answers with answer(), and 'permissionClosed'
 * (thread, id) when that question is withdrawn unanswered. */
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
  /** The questions the panel is showing: its answer resolves the page's. */
  private readonly pending = new Map<number, { thread: string; answer(allow: boolean): void }>()
  /** The number of the next question, which only names it. */
  private asked = 1
  /** Whether the tabs' session is told how to ask and where downloads go. */
  private configured = false

  constructor(private readonly permissions: Permissions) {
    super()
  }

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

  /** Opens a page in a new tab after the active one, made active. */
  async openTab(thread: string, url: string): Promise<void> {
    const target = address(url)
    await load(this.newTab(thread), target)
  }

  /** The browser opened: a thread with no tab yet starts at the start
   * page. A tab the agent opened is there already, as it opens it before
   * the panel shows. */
  async start(thread: string): Promise<void> {
    if (this.strips.get(thread)?.tabs.length) return
    await this.openTab(thread, START_PAGE)
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
    // A question about a page that is going away is answered no.
    for (const [id, question] of this.pending) {
      if (question.thread !== thread) continue
      this.pending.delete(id)
      question.answer(false)
      this.emit('permissionClosed', thread, id)
    }
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

  /** The person's answer to a question about a page, as the panel sends it. */
  answer(id: number, allow: boolean): void {
    this.pending.get(id)?.answer(allow)
  }

  /** What an action would do in the thread's active tab. */
  async describe(thread: string, action: string, args: Record<string, unknown>): Promise<Description> {
    if (action === 'navigate' || action === 'open') {
      const url = address(text(args, 'url'))
      return { host: new URL(url).host, text: action === 'open' ? `Open ${url} in a new tab` : `Open ${url}` }
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
      case 'paste': {
        const pasted = typeof args.text === 'string' ? args.text : ''
        const into = args.ref === undefined ? 'the focused field' : this.element(wc, ref(args))
        const kind = typeof args.html === 'string' && args.html ? 'rich text' : 'text'
        return { host, text: `Paste ${kind} "${excerpt(pasted)}" into ${into} on ${host}` }
      }
      case 'upload': {
        const files = uploadFiles(args)
        const into = args.ref === undefined ? "the page's file input" : this.element(wc, ref(args))
        const what = files.length === 1 ? files[0] : `${files.length} files`
        return { host, text: `Upload ${what} into ${into} on ${host}` }
      }
      case 'screenshot':
        return { host, text: `Take a picture of ${host}` }
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
      case 'open':
        await this.openTab(thread, text(args, 'url'))
        break
      case 'tabs':
        return this.list(thread, args)
      case 'screenshot': {
        const wc = this.tab(thread)
        const full = args.full === true
        const png = await this.pages.act(wc, this.offscreen(thread), (page) => page.screenshot({ fullPage: full, animations: 'disabled' }))
        const file = join(app.getPath('temp'), `ollupi-browser-${process.pid}-${Date.now()}.png`)
        await writeFile(file, png)
        return `A ${pngSize(png)} picture of ${hostOf(wc.getURL())} is saved at ${file}; open it to look at the page. A snapshot is how its text is read.`
      }
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
          // An editable takes keys, not a value: fill puts the whole text in as
          // one run, folds its newlines into spaces, and cannot empty it.
          if (await field.evaluate((el) => (el as HTMLElement).isContentEditable)) {
            await field.click()
            await page.keyboard.press('ControlOrMeta+A')
            await page.keyboard.press('Delete')
            await page.keyboard.insertText(typed)
          } else {
            await field.fill(typed)
          }
          if (args.submit === true) await field.press('Enter')
        })
        break
      }
      case 'press_key': {
        const key = text(args, 'key')
        await this.act(thread, (page) => page.keyboard.press(key))
        break
      }
      case 'paste': {
        const value = args.text
        if (typeof value !== 'string' || !value) throw new Refusal('text is required')
        const html = args.html === undefined ? undefined : htmlOf(args)
        const r = args.ref === undefined ? undefined : ref(args)
        let put: Paste = { chars: value.length, blocks: blocks(value) }
        await this.act(thread, async (page) => {
          const field = r ? await located(page, r) : page.locator(':focus')
          const handle = await field.elementHandle()
          if (!handle) throw new Refusal('there is no field to paste into; click it first')
          put = await pasted(page, handle, value, html)
        })
        if (reads(args, action)) break
        const wc = this.tab(thread)
        const into = r === undefined ? 'the focused field' : this.element(wc, r)
        return `Pasted ${put.chars.toLocaleString('en-US')} characters in ${put.blocks} block${put.blocks === 1 ? '' : 's'} into ${into} on ${hostOf(wc.getURL())}. The page was not read back; browser_snapshot reads it.`
      }
      case 'upload': {
        const files = uploadFiles(args)
        const r = args.ref === undefined ? undefined : ref(args)
        await this.act(thread, async (page) => {
          const input = r ? await located(page, r) : page.locator('input[type=file]').first()
          if (r === undefined && (await input.count()) === 0) throw new Refusal("the page has no file input; name the input's ref")
          await input.setInputFiles(files)
        })
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
    if (!reads(args, action)) return this.done(thread, action, args)
    return this.read(thread)
  }

  /** What an action did, for a call that asked not to read the page back. */
  private async done(thread: string, action: string, args: Record<string, unknown>): Promise<string> {
    const said = (await this.describe(thread, action, args)).text
    return `${said}. The page was not read back; browser_snapshot reads it.`
  }

  /** A thread's tabs, and with select, the one actions act in from now on.
   * Answered as text, as no page has to be read for it. */
  private list(thread: string, args: Record<string, unknown>): string {
    const strip = this.strips.get(thread)
    if (!strip?.tabs.length) throw new Refusal('this conversation has no tab open; navigate or open a page first')
    if (args.select !== undefined) {
      if (!Number.isInteger(args.select) || (args.select as number) < 1) throw new Refusal('select is a tab number from 1')
      const n = args.select as number
      const view = strip.tabs[n - 1]
      if (!view) throw new Refusal(strip.tabs.length === 1 ? 'there is 1 tab' : `there are ${strip.tabs.length} tabs`)
      this.select(thread, view.webContents.id)
    }
    const rows = strip.tabs.map((v, i) => {
      const wc = v.webContents
      const active = v === strip.active ? ' (the one actions act in)' : ''
      return `${i + 1}. ${wc.getTitle() || '(no title)'} — ${wc.getURL()}${active}`
    })
    return `${strip.tabs.length} tab${strip.tabs.length === 1 ? '' : 's'} in this conversation:\n${rows.join('\n')}`
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

  /** Tells the tabs' session how a page's questions are answered, once. The
   * request handler is the only permission handler set: the check handler
   * grants a permission without asking, which is not what a browser does. */
  private configure(): void {
    if (this.configured) return
    this.configured = true
    const s = session.fromPartition(PARTITION)
    s.setUserAgent(chromeAgent(s.getUserAgent()))
    s.setPermissionRequestHandler((wc, permission, callback, details) => {
      // Every path answers once: a page whose question is dropped waits
      // forever on it.
      void this.permission(wc, permission, details.requestingUrl).then(callback, () => callback(false))
    })
  }

  /** Whether a page may use a permission: the person's answer for its site,
   * if they gave one, or their answer now. A question can only be shown about
   * the tab the panel shows, so a page elsewhere is refused; an answer kept
   * for its site needs no question and holds wherever the page is. */
  private async permission(wc: Electron.WebContents, permission: string, url: string): Promise<boolean> {
    const how = asking(permission)
    if (how === 'never') return false
    const host = hostOf(url || wc.getURL())
    if (!host) return false
    if (how === 'once') {
      // An answer that cannot be read is none, and the person is asked.
      const before = await this.permissions.answered(host, permission).catch(() => undefined)
      if (before !== undefined) return before
    }
    const strip = [...this.strips.values()].find((s) => s.tabs.some((v) => v.webContents === wc))
    const view = strip?.tabs.find((v) => v.webContents === wc)
    if (!strip || !view || strip.active !== view || this.shown?.thread !== strip.thread) return false
    const allow = await this.question(strip.thread, host, permission, how === 'once')
    // Kept for next time, when it is a permission that is kept; a question
    // not kept is put again by the next page that asks.
    if (how === 'once') await this.permissions.answer(host, permission, allow).catch(() => {})
    return allow
  }

  /** Asks the person in the panel and answers with what they said: no answer
   * within the minute is no, as a notice left alone. */
  private question(thread: string, host: string, permission: string, keep: boolean): Promise<boolean> {
    const id = this.asked++
    return new Promise<boolean>((resolve) => {
      const answer = (allow: boolean) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(allow)
      }
      const timer = setTimeout(() => {
        answer(false)
        this.emit('permissionClosed', thread, id)
      }, ASK_TIMEOUT)
      this.pending.set(id, { thread, answer })
      this.emit('permission', thread, { id, host, permission, keep })
    })
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
    this.configure()
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
      if (now && isWebPage(url)) void this.openTab(now.thread, url)
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

/** The host a permission question is about, port included; '' when the
 * address is not one. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
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

/** What a paste put in and how much of it: a line a call answers with when
 * the page is not read back. */
export interface Paste {
  chars: number
  blocks: number
}

/** Puts text into a field as a paste does, in one go: the page's own paste
 * handler first, as a rich-text editor takes the clipboard, then the
 * browser's insertion, for a field that handles no paste event. html gives
 * the same text as markup, which an editor that takes rich text keeps as
 * headings, bold, lists and links. A field that takes none of it is
 * refused, as the agent's to read. */
async function pasted(page: Page, field: ElementHandle<Element>, value: string, html?: string): Promise<Paste> {
  const before = await fieldText(field)
  await field.evaluate(
    (el, { value, html }) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      if (html) data.setData('text/html', html)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    },
    { value, html },
  )
  if (!(await settles(field, before))) {
    await field.evaluate(putCaretAtEnd)
    await page.keyboard.insertText(value)
    if (!(await settles(field, before))) {
      throw new Refusal('the field did not take the text; click it first, or name its ref in the snapshot')
    }
  }
  return { chars: value.length, blocks: blocks(value) }
}

/** How many blocks of text a text has: what a rich-text editor makes of it,
 * one paragraph or heading per line that is not blank. */
function blocks(value: string): number {
  return value.split(/\n+/).filter((line) => line.trim()).length
}

/** Whether a call reads the page back after acting. A paste leaves the page
 * around the field as it was, so it answers with what it did unless asked.
 * snapshot=false keeps any call from reading the page back: a run of edits
 * costs one snapshot at the end instead of one per call. */
export function reads(args: Record<string, unknown>, action: string): boolean {
  if (typeof args.snapshot === 'boolean') return args.snapshot
  return action !== 'paste'
}

/** The markup a paste carries, if it carries one. */
function htmlOf(args: Record<string, unknown>): string {
  const html = args.html
  if (typeof html !== 'string' || !html) throw new Refusal('html is the text as markup')
  return html
}

/** The files an upload is given, as paths: a missing one is the agent's to
 * read before the page waits on it. */
function uploadFiles(args: Record<string, unknown>): string[] {
  const given = args.files
  if (!Array.isArray(given) || given.length === 0 || given.some((f) => typeof f !== 'string' || !f)) {
    throw new Refusal('files is a list of paths, at least one')
  }
  const files = given as string[]
  const missing = files.find((f) => !existsSync(f))
  if (missing) throw new Refusal(`there is no file at ${missing}`)
  return files
}

/** A PNG's size, from its header. */
function pngSize(png: Buffer): string {
  return `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`
}

/** A field's text as a person would read it: an input's value, or an
 * editable's text. */
function fieldText(field: ElementHandle<Element>): Promise<string> {
  return field.evaluate((el) => ('value' in el && typeof el.value === 'string' ? el.value : ((el as HTMLElement).innerText ?? '')))
}

/** Whether the field's text changed within a moment: a page that takes the
 * text may tell its editor so asynchronously. */
async function settles(field: ElementHandle<Element>, before: string): Promise<boolean> {
  const deadline = Date.now() + 2_000
  for (;;) {
    if ((await fieldText(field)) !== before) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** The caret at the field's end, where a paste puts its text. */
function putCaretAtEnd(el: Element): void {
  if (!(el instanceof HTMLElement)) return
  el.focus()
  const input = el as HTMLInputElement | HTMLTextAreaElement
  if (typeof input.value === 'string' && typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(input.value.length, input.value.length)
    return
  }
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = document.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

/** The start of a text for a permission notice, in one line. */
function excerpt(text: string, length = 80): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > length ? `${line.slice(0, length)}…` : line
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
