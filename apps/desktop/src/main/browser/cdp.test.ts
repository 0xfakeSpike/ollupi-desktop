import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { TabsOverCDP, type Tab } from './cdp'

/** A tab's debugger as Electron's behaves: it answers commands, and emits
 * the page's events and its own detach. */
class FakeDebugger extends EventEmitter {
  readonly sent: { method: string; params?: unknown; sessionId?: string }[] = []
  constructor(private readonly targetId: string) {
    super()
  }
  attach(): void {}
  async sendCommand(method: string, params?: unknown, sessionId?: string): Promise<unknown> {
    if (method === 'Target.getTargetInfo') return { targetInfo: { targetId: this.targetId, type: 'page', url: 'https://example.com/' } }
    this.sent.push({ method, params, sessionId })
    return { done: method }
  }
}

function tab(targetId: string): { tab: Tab; debugger: FakeDebugger } {
  const debug = new FakeDebugger(targetId)
  return { tab: { debugger: debug as unknown as Tab['debugger'] }, debugger: debug }
}

/** A client on the transport, keeping what it hears. */
function connected(tabs: TabsOverCDP) {
  const heard: Record<string, unknown>[] = []
  const transport = tabs.transport()
  transport.onmessage = (m) => heard.push(m as Record<string, unknown>)
  let id = 0
  const send = async (method: string, params?: unknown, sessionId?: string) => {
    const at = ++id
    transport.send({ id: at, method, params, sessionId })
    for (let turn = 0; turn < 10 && !heard.some((m) => m.id === at); turn++) await new Promise((r) => setImmediate(r))
    return heard.find((m) => m.id === at)
  }
  return { heard, send, transport }
}

describe('TabsOverCDP', () => {
  it('answers what a browser answers on connecting, and refuses the rest', async () => {
    const { send } = connected(new TabsOverCDP())
    expect(((await send('Browser.getVersion'))!.result as { product: string }).product).toMatch(/^Chrome\//)
    expect((await send('Browser.setDownloadBehavior', { behavior: 'allow' }))!.result).toEqual({})
    expect((await send('Target.createTarget', { url: 'about:blank' }))!.error).toEqual({ code: -32000, message: 'Target.createTarget is not offered' })
  })

  it('tells the client of each tab once it asks, and of tabs added after', async () => {
    const tabs = new TabsOverCDP()
    await tabs.add(tab('A').tab)
    const { heard, send } = connected(tabs)
    expect(heard).toEqual([])
    await send('Target.setAutoAttach', { autoAttach: true, flatten: true })
    await tabs.add(tab('B').tab)
    const attached = heard.filter((m) => m.method === 'Target.attachedToTarget').map((m) => m.params as { sessionId: string; targetInfo: { targetId: string } })
    expect(attached.map((p) => [p.sessionId, p.targetInfo.targetId])).toEqual([
      ['tab-1', 'A'],
      ['tab-2', 'B'],
    ])
  })

  it("routes a tab's commands to its debugger, and a frame's to the tab that holds it", async () => {
    const tabs = new TabsOverCDP()
    const a = tab('A')
    await tabs.add(a.tab)
    const { heard, send } = connected(tabs)
    expect((await send('Page.enable', {}, 'tab-1'))!.result).toEqual({ done: 'Page.enable' })
    // Chromium attaches a frame of another site inside the tab.
    a.debugger.emit('message', {}, 'Target.attachedToTarget', { sessionId: 'frame-9', targetInfo: { targetId: 'F' } }, undefined)
    expect(heard.at(-1)).toEqual({ sessionId: 'tab-1', method: 'Target.attachedToTarget', params: { sessionId: 'frame-9', targetInfo: { targetId: 'F' } } })
    await send('Runtime.enable', {}, 'frame-9')
    expect(a.debugger.sent.at(-1)).toEqual({ method: 'Runtime.enable', params: {}, sessionId: 'frame-9' })
    a.debugger.emit('message', {}, 'Runtime.executionContextCreated', { context: {} }, 'frame-9')
    expect(heard.at(-1)).toEqual({ sessionId: 'frame-9', method: 'Runtime.executionContextCreated', params: { context: {} } })
    expect((await send('Runtime.enable', {}, 'nobody'))!.error).toEqual({ code: -32000, message: 'no session nobody' })
  })

  it('sends a command the client answers an event with only once the event has returned', async () => {
    const tabs = new TabsOverCDP()
    const a = tab('A')
    await tabs.add(a.tab)
    const { transport } = connected(tabs)
    // As Playwright does when told of a service worker: Chromium is still
    // attaching it while the event is being heard.
    transport.onmessage = (m) => {
      const { method, params } = m as { method?: string; params?: { sessionId: string } }
      if (method === 'Target.attachedToTarget') transport.send({ id: 1, method: 'Target.detachFromTarget', params: { sessionId: params!.sessionId }, sessionId: 'tab-1' })
    }
    a.debugger.emit('message', {}, 'Target.attachedToTarget', { sessionId: 'sw-1', targetInfo: { targetId: 'W', type: 'service_worker' } }, undefined)
    expect(a.debugger.sent).toEqual([])
    await new Promise((r) => setImmediate(r))
    expect(a.debugger.sent).toEqual([{ method: 'Target.detachFromTarget', params: { sessionId: 'sw-1' }, sessionId: undefined }])
  })

  it('lets frames that open later start running, not paused for a debugger', async () => {
    const tabs = new TabsOverCDP()
    const a = tab('A')
    await tabs.add(a.tab)
    const { send } = connected(tabs)
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, 'tab-1')
    expect(a.debugger.sent.at(-1)).toEqual({ method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId: undefined })
  })

  it('tells the client when a tab goes, and forgets its frames', async () => {
    const tabs = new TabsOverCDP()
    const a = tab('A')
    await tabs.add(a.tab)
    const { heard, send } = connected(tabs)
    a.debugger.emit('message', {}, 'Target.attachedToTarget', { sessionId: 'frame-9' }, undefined)
    a.debugger.emit('detach', {}, 'target closed')
    expect(heard.at(-1)).toEqual({ method: 'Target.detachedFromTarget', params: { sessionId: 'tab-1', targetId: 'A' } })
    expect((await send('Page.enable', {}, 'tab-1'))!.error).toBeDefined()
    expect((await send('Runtime.enable', {}, 'frame-9'))!.error).toBeDefined()
  })

  it('stops telling a client that closed', async () => {
    const tabs = new TabsOverCDP()
    const { heard, send, transport } = connected(tabs)
    await send('Target.setAutoAttach', { autoAttach: true })
    let closed = false
    transport.onclose = () => (closed = true)
    transport.close()
    await tabs.add(tab('A').tab)
    expect(closed).toBe(true)
    expect(heard.some((m) => m.method === 'Target.attachedToTarget')).toBe(false)
  })
})
