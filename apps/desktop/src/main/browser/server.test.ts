import { describe, expect, it } from 'vitest'
import { normalize } from './address'
import type { AgentBrowser } from './browser'
import { BrowserServer } from './server'

const page = (what: string) => async () => `Title\nhttps://example.test/\n\n${what}`
const browser = {
  navigate: async (url: string) => `opened ${url}`,
  click: async (ref: string) => {
    throw new Error(`no element ${ref} on the page now; take a new snapshot`)
  },
  snapshot: page('- link "More" [ref=e1]'),
} as unknown as AgentBrowser

async function started() {
  const server = new BrowserServer(browser, 'test')
  await server.listen()
  const { OLLUPI_BROWSER_URL: url, OLLUPI_BROWSER_TOKEN: token } = server.env()
  const post = (body: unknown, auth = `Bearer ${token}`) =>
    fetch(url!, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) })
  return { url: url!, post }
}

describe('BrowserServer', () => {
  it('answers initialize, lists its tools and calls them', async () => {
    const { post } = await started()
    const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json()
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} } })
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

    const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
    const names = list.result.tools.map((t: { name: string }) => t.name)
    expect(names).toEqual(['navigate', 'snapshot', 'click', 'type', 'press_key', 'scroll', 'back'])
    expect(list.result.tools.find((t: { name: string }) => t.name === 'click').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })

    const opened = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'navigate', arguments: { url: 'example.test' } } })).json()
    expect(opened.result).toEqual({ content: [{ type: 'text', text: 'opened example.test' }] })
  })

  it('reports a failed action as the tool’s error, for the agent to read', async () => {
    const { post } = await started()
    const res = await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'click', arguments: { ref: 'e9' } } })).json()
    expect(res.result).toEqual({ content: [{ type: 'text', text: 'no element e9 on the page now; take a new snapshot' }], isError: true })
  })

  it('takes nothing without its token, and only POSTs', async () => {
    const { url, post } = await started()
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer wrong')).status).toBe(401)
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, '')).status).toBe(401)
    const { OLLUPI_BROWSER_TOKEN } = new BrowserServer(browser, 'x').env()
    expect(OLLUPI_BROWSER_TOKEN).toHaveLength(64)
    expect((await fetch(url, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401)
  })
})

describe('normalize', () => {
  it('adds https, or http for a local server, and opens only web pages', () => {
    expect(normalize('example.com/a')).toBe('https://example.com/a')
    expect(normalize('localhost:5173')).toBe('http://localhost:5173/')
    expect(normalize(' http://127.0.0.1:8080/x ')).toBe('http://127.0.0.1:8080/x')
    expect(() => normalize('file:///etc/passwd')).toThrow('only http and https')
    expect(() => normalize('javascript:alert(1)')).toThrow()
  })
})
