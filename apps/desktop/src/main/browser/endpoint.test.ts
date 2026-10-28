import { describe, expect, it, vi } from 'vitest'

// The endpoint's browser is a stand-in; Electron is not loaded in tests.
vi.mock('electron', () => ({}))

const { normalize } = await import('./address')
const { Refusal } = await import('./browser')
const { BrowserEndpoint } = await import('./endpoint')

const browser = {
  describe: async (thread: string, action: string) => ({ host: 'example.com', text: `${thread} ${action}` }),
  call: async (thread: string, action: string, args: Record<string, unknown>) => {
    if (args.ref === 'e9') throw new Refusal('no element e9 on the page now; take a new snapshot')
    return `${thread} did ${action}`
  },
} as never

async function started() {
  const endpoint = new BrowserEndpoint(browser)
  await endpoint.listen()
  const { OLLUPI_BROWSER_URL: url, OLLUPI_BROWSER_TOKEN: token } = endpoint.env()
  const post = (path: string, body: unknown, auth = `Bearer ${token}`) =>
    fetch(url + path, { method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(body) })
  return { url: url!, post }
}

describe('BrowserEndpoint', () => {
  it('describes and does a call in the thread that makes it', async () => {
    const { post } = await started()
    expect(await (await post('/describe', { thread: 'th1', action: 'click', arguments: { ref: 'e1' } })).json()).toEqual({ host: 'example.com', text: 'th1 click' })
    expect(await (await post('/call', { thread: 'th2', action: 'snapshot' })).json()).toEqual({ text: 'th2 did snapshot' })
  })

  it('answers 422 with why when an action cannot be done', async () => {
    const { post } = await started()
    const res = await post('/call', { thread: 'th1', action: 'click', arguments: { ref: 'e9' } })
    expect([res.status, await res.json()]).toEqual([422, { error: 'no element e9 on the page now; take a new snapshot' }])
  })

  it('takes nothing without its token or a thread', async () => {
    const { url, post } = await started()
    expect((await post('/call', { thread: 'th1', action: 'snapshot' }, 'Bearer wrong')).status).toBe(401)
    expect((await post('/call', { action: 'snapshot' })).status).toBe(400)
    expect((await fetch(`${url}/call`)).status).toBe(401)
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
