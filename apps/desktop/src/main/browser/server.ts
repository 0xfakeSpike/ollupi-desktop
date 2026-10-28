// The browser's tools for the agent, served as an MCP server on loopback,
// over streamable HTTP with plain JSON responses. The backend connects to
// it like any MCP server, as `browser`, so ollupi's permissions apply to its
// tools by their annotations; it is told where the server is and the token
// it takes in its environment. Only what the agent needs of MCP is here:
// initialize, ping and the tools.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AgentBrowser } from './browser'

interface Tool {
  name: string
  description: string
  inputSchema: object
  annotations: { title: string; readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean }
  call(browser: AgentBrowser, args: Record<string, unknown>): Promise<string>
}

const refArg = { type: 'string', description: 'The ref of an element in the latest snapshot, such as e12.' }
const object = (properties: object, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const text = (args: Record<string, unknown>, key: string): string => {
  const v = args[key]
  if (typeof v !== 'string' || !v) throw new Error(`${key} is required`)
  return v
}

/** Each answers with the page as it then is: its title, address, and its
 * elements with refs to act on. */
export const tools: Tool[] = [
  {
    name: 'navigate',
    description:
      "Open a web page in the app's built-in browser, which the user sees beside the conversation. Answers with the page as text; each element you can act on has a ref such as e3.",
    inputSchema: object({ url: { type: 'string', description: 'The address; https:// is added when it has no scheme (http:// for localhost).' } }, ['url']),
    annotations: { title: 'Open page', readOnlyHint: true, openWorldHint: true },
    call: (b, a) => b.navigate(text(a, 'url')),
  },
  {
    name: 'snapshot',
    description: 'Read the page open in the browser again, with fresh refs. Use it after the page changes on its own, or when a ref is stale.',
    inputSchema: object({}),
    annotations: { title: 'Read page', readOnlyHint: true, openWorldHint: false },
    call: (b) => b.snapshot(),
  },
  {
    name: 'click',
    description: 'Click an element of the page by its ref, as a person would.',
    inputSchema: object({ ref: refArg }, ['ref']),
    annotations: { title: 'Click', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    call: (b, a) => b.click(text(a, 'ref')),
  },
  {
    name: 'type',
    description: 'Replace the text of a field by its ref, and optionally press Enter after it.',
    inputSchema: object({ ref: refArg, text: { type: 'string' }, submit: { type: 'boolean', description: 'Press Enter after typing.' } }, ['ref', 'text']),
    annotations: { title: 'Type', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    call: (b, a) => {
      if (typeof a.text !== 'string') throw new Error('text is required')
      return b.type(text(a, 'ref'), a.text, a.submit === true)
    },
  },
  {
    name: 'press_key',
    description: 'Press a key on the focused element: Enter, Tab, Escape, Backspace, Delete, Up, Down, Left, Right, PageUp, PageDown, Home, End, or one character.',
    inputSchema: object({ key: { type: 'string' } }, ['key']),
    annotations: { title: 'Press key', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    call: (b, a) => b.press(text(a, 'key')),
  },
  {
    name: 'scroll',
    description: 'Scroll the page by most of a screen, to read what a long page did not show.',
    inputSchema: object({ direction: { type: 'string', enum: ['down', 'up'] } }, ['direction']),
    annotations: { title: 'Scroll', readOnlyHint: true, openWorldHint: false },
    call: (b, a) => b.scroll(a.direction !== 'up'),
  },
  {
    name: 'back',
    description: 'Go back to the previous page.',
    inputSchema: object({}),
    annotations: { title: 'Back', readOnlyHint: true, openWorldHint: true },
    call: (b) => b.goBack(),
  },
]

type Message = { jsonrpc: '2.0'; id?: string | number; method?: string; params?: Record<string, unknown> }

export class BrowserServer {
  private readonly token = randomBytes(32).toString('hex')
  private url = ''

  constructor(
    private readonly browser: AgentBrowser,
    private readonly version: string,
  ) {}

  /** Listens on a free loopback port; the backend starts after this. */
  async listen(): Promise<void> {
    const server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`
  }

  /** What the backend needs to connect: given to every start and check. */
  env(): NodeJS.ProcessEnv {
    return { OLLUPI_BROWSER_URL: this.url, OLLUPI_BROWSER_TOKEN: this.token }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req.headers.authorization)) return end(res, 401)
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/mcp') return end(res, 404)
    // No server-sent stream: every answer is the POST's own response.
    if (req.method !== 'POST') return end(res, 405)
    let body: Message | Message[]
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return json(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
    }
    const messages = Array.isArray(body) ? body : [body]
    const answers = (await Promise.all(messages.map((m) => this.answer(m)))).filter((a) => a !== undefined)
    if (answers.length === 0) return end(res, 202)
    json(res, Array.isArray(body) ? answers : answers[0])
  }

  /** A request's response; a notification has none. */
  private async answer(m: Message): Promise<object | undefined> {
    if (m.id === undefined) return undefined
    const ok = (result: object) => ({ jsonrpc: '2.0', id: m.id, result })
    switch (m.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'ollupi-browser', version: this.version },
        })
      case 'ping':
        return ok({})
      case 'tools/list':
        return ok({ tools: tools.map(({ call: _, ...t }) => t) })
      case 'tools/call': {
        const tool = tools.find((t) => t.name === m.params?.name)
        if (!tool) return { jsonrpc: '2.0', id: m.id, error: { code: -32602, message: `no tool named ${String(m.params?.name)}` } }
        try {
          const text = await tool.call(this.browser, (m.params?.arguments as Record<string, unknown>) ?? {})
          return ok({ content: [{ type: 'text', text }] })
        } catch (err) {
          return ok({ content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true })
        }
      }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `no method ${String(m.method)}` } }
    }
  }

  private authorized(header: string | undefined): boolean {
    const given = Buffer.from(header ?? '')
    const want = Buffer.from(`Bearer ${this.token}`)
    return given.length === want.length && timingSafeEqual(given, want)
  }
}

function end(res: ServerResponse, status: number): void {
  res.writeHead(status).end()
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}
