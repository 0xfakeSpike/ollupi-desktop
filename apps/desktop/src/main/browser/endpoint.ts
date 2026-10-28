// Where the sidecar's browser provider reaches the app's browser: a JSON
// endpoint on loopback, behind a token the backend gets in its environment.
// POST /describe says what an action would do in a thread's tab, POST
// /call does it; an action that cannot be done answers 422 with why, for
// the agent to read.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Refusal, type AgentBrowser } from './browser'

export class BrowserEndpoint {
  private readonly token = randomBytes(32).toString('hex')
  private url = ''

  constructor(private readonly browser: AgentBrowser) {}

  /** Listens on a free loopback port; the backend starts after this. */
  async listen(): Promise<void> {
    const server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  /** What the backend needs to reach it: given to every start and check. */
  env(): NodeJS.ProcessEnv {
    return { OLLUPI_BROWSER_URL: this.url, OLLUPI_BROWSER_TOKEN: this.token }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req.headers.authorization)) return send(res, 401)
    if (req.method !== 'POST') return send(res, 405)
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path !== '/describe' && path !== '/call') return send(res, 404)
    let body: { thread?: unknown; action?: unknown; arguments?: unknown }
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return send(res, 400)
    }
    const { thread, action } = body
    const args = (body.arguments ?? {}) as Record<string, unknown>
    if (typeof thread !== 'string' || !thread || typeof action !== 'string' || typeof args !== 'object') return send(res, 400)
    try {
      const out = path === '/describe' ? await this.browser.describe(thread, action, args) : { text: await this.browser.call(thread, action, args) }
      send(res, 200, out)
    } catch (err) {
      if (err instanceof Refusal) return send(res, 422, { error: err.message })
      send(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private authorized(header: string | undefined): boolean {
    const given = Buffer.from(header ?? '')
    const want = Buffer.from(`Bearer ${this.token}`)
    return given.length === want.length && timingSafeEqual(given, want)
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) return void res.writeHead(status).end()
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}
