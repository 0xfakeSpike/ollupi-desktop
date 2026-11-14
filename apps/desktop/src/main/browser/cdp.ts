// The tabs the agent acts in, offered to Playwright as one browser over the
// Chrome DevTools Protocol, in-process. Electron speaks CDP for one page at
// a time (webContents.debugger) and Playwright asks for a browser: this
// answers the few browser-level commands Playwright sends and routes the
// rest to each tab's debugger, as VS Code's integrated browser and
// Playwright MCP's extension relay do. No debugging port is opened, and only
// the tabs added here can be reached, never the app's own window.

import type { ConnectOverCDPTransport } from 'playwright-core'

/** A CDP message either way: a command, its answer, or an event. */
interface Message {
  id?: number
  sessionId?: string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

interface TargetInfo {
  targetId: string
  [key: string]: unknown
}

/** What a tab needs to be reached over CDP: its debugger. */
export interface Tab {
  readonly debugger: Pick<Electron.Debugger, 'attach' | 'sendCommand' | 'on'>
}

export class TabsOverCDP {
  /** The tabs by the session the client knows each by. */
  private readonly tabs = new Map<string, { tab: Tab; targetInfo: TargetInfo }>()
  /** Sessions Chromium opened inside a tab, such as an iframe of another
   * site, by the tab's session. */
  private readonly children = new Map<string, string>()
  private client: ConnectOverCDPTransport | undefined
  /** Whether the client asked to hear of every tab, as Playwright does on
   * connecting. */
  private announcing = false
  private count = 0

  /** The transport a client connects over. */
  transport(): ConnectOverCDPTransport {
    const transport: ConnectOverCDPTransport = {
      // A command goes on in a task of its own, as over a socket. Playwright
      // answers some events the moment it hears them: told of a service
      // worker, it detaches from it at once. Sent from inside the event, the
      // command reaches Chromium while it is still attaching that worker,
      // which then finds its session gone and crashes the app.
      send: (message) => setImmediate(() => void this.receive(message as Message)),
      close: () => {
        if (this.client !== transport) return
        this.client = undefined
        this.announcing = false
        transport.onclose?.()
      },
    }
    this.client = transport
    return transport
  }

  /** Attaches to a tab and offers it to the client. */
  async add(tab: Tab): Promise<void> {
    const sessionId = `tab-${++this.count}`
    tab.debugger.attach('1.3')
    const { targetInfo } = (await tab.debugger.sendCommand('Target.getTargetInfo')) as { targetInfo: TargetInfo }
    this.tabs.set(sessionId, { tab, targetInfo })
    tab.debugger.on('message', (_event, method, params, child) => {
      if (method === 'Target.attachedToTarget') this.children.set(params.sessionId, sessionId)
      if (method === 'Target.detachedFromTarget') this.children.delete(params.sessionId)
      this.send({ sessionId: child || sessionId, method, params })
    })
    // The tab was closed, or its page crashed.
    tab.debugger.on('detach', () => {
      this.tabs.delete(sessionId)
      for (const [child, owner] of this.children) if (owner === sessionId) this.children.delete(child)
      this.send({ method: 'Target.detachedFromTarget', params: { sessionId, targetId: targetInfo.targetId } })
    })
    if (this.announcing) this.announce(sessionId)
  }

  private announce(sessionId: string): void {
    const { targetInfo } = this.tabs.get(sessionId)!
    this.send({ method: 'Target.attachedToTarget', params: { sessionId, targetInfo: { ...targetInfo, attached: true }, waitingForDebugger: false } })
  }

  private send(message: Message): void {
    this.client?.onmessage?.(message)
  }

  private async receive({ id, sessionId, method, params }: Message): Promise<void> {
    try {
      this.send({ id, sessionId, result: await this.command(sessionId, method ?? '', params) })
    } catch (err) {
      this.send({ id, sessionId, error: { code: -32000, message: err instanceof Error ? err.message : String(err) } })
    }
  }

  private async command(sessionId: string | undefined, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
    if (!sessionId) return this.browserCommand(method)
    // A frame of another site that starts paused for the debugger is never
    // resumed through Electron's debugger: the command to resume it goes
    // unanswered, and the page never finishes loading. Frames start running
    // instead, as in VS Code's integrated browser.
    if (method === 'Target.setAutoAttach') params = { ...params, waitForDebuggerOnStart: false }
    const tab = this.tabs.get(sessionId)
    if (tab) return tab.tab.debugger.sendCommand(method, params)
    const owner = this.tabs.get(this.children.get(sessionId) ?? '')
    if (owner) return owner.tab.debugger.sendCommand(method, params, sessionId)
    throw new Error(`no session ${sessionId}`)
  }

  /** The browser-level commands Playwright sends on connecting. Downloads
   * stay the app's: it asks where each one goes. */
  private browserCommand(method: string): unknown {
    switch (method) {
      case 'Browser.getVersion':
        return { protocolVersion: '1.3', product: `Chrome/${process.versions.chrome}`, revision: '', userAgent: '', jsVersion: process.versions.v8 }
      case 'Target.setAutoAttach':
        this.announcing = true
        for (const sessionId of this.tabs.keys()) this.announce(sessionId)
        return {}
      case 'Target.getTargetInfo':
      case 'Browser.setDownloadBehavior':
        return {}
      default:
        throw new Error(`${method} is not offered`)
    }
  }
}
