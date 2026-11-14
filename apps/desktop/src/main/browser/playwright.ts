// Playwright drives the tabs the agent acts in, over TabsOverCDP. It is
// loaded and connected the first time the agent acts, and attaches to a tab
// the first time the agent acts in that one: a tab only the person uses is
// never under automation.

import type { Browser, Page } from 'playwright-core'
import { TabsOverCDP } from './cdp'

/** How long one action may wait for its element to be ready. */
const ACTION_TIMEOUT = 10_000

type Playwright = typeof import('playwright-core')

let loading: Promise<Playwright> | undefined

/** Playwright itself, loaded once: loading it takes a fifth of a second,
 * which the app's start does not pay. */
export function playwright(): Promise<Playwright> {
  loading ??= import('playwright-core')
  return loading
}

/** The size a tab is laid out at while the agent acts in it off screen. */
export interface Size {
  width: number
  height: number
}

export class Pages {
  private readonly tabs = new TabsOverCDP()
  private browser: Promise<Browser> | undefined
  private readonly pages = new Map<Electron.WebContents, Promise<Page>>()
  /** Attaching, one tab at a time: the next page Playwright hears of is the
   * tab being attached. */
  private attaching: Promise<unknown> = Promise.resolve()

  /** Runs an action on a tab's page, the page awake for it: a page that is
   * not on screen, or whose window is hidden, runs no animation frames, and
   * Playwright waits on them before it acts. A tab off screen has no size
   * of its own, so it is laid out at the given one meanwhile. */
  async act<T>(wc: Electron.WebContents, offscreen: Size | undefined, action: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.of(wc)
    try {
      await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
      if (offscreen) await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { ...offscreen, deviceScaleFactor: 0, mobile: false })
      return await action(page)
    } finally {
      // An action that closed its tab leaves nothing to wake.
      if (!wc.isDestroyed()) {
        if (offscreen) await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
        await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false })
      }
    }
  }

  /** A tab's page, attached the first time it is asked for. */
  of(wc: Electron.WebContents): Promise<Page> {
    const known = this.pages.get(wc)
    if (known) return known
    const page = this.attach(wc)
    this.pages.set(wc, page)
    page.catch(() => this.pages.delete(wc))
    wc.once('destroyed', () => this.pages.delete(wc))
    return page
  }

  private attach(wc: Electron.WebContents): Promise<Page> {
    const attached = this.attaching.then(async () => {
      const context = (await this.connect()).contexts()[0]!
      const [page] = await Promise.all([context.waitForEvent('page'), this.tabs.add(wc)])
      page.setDefaultTimeout(ACTION_TIMEOUT)
      return page
    })
    this.attaching = attached.catch(() => undefined)
    return attached
  }

  private connect(): Promise<Browser> {
    this.browser ??= (async () => {
      const { chromium } = await playwright()
      // noDefaults: the tabs are the person's, so Playwright leaves their
      // emulation, focus and downloads as they are.
      return chromium.connectOverCDP(this.tabs.transport(), { noDefaults: true, isLocal: true })
    })()
    this.browser.catch(() => (this.browser = undefined))
    return this.browser
  }
}
