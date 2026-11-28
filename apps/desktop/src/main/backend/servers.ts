// The ollupi servers this app connects to, besides the one it runs itself:
// a Mac mini at home behind a Cloudflare Tunnel, a server on a LAN reached
// through an SSH tunnel, a second copy of ollupi on this Mac. Which one is in
// use and each server's secrets are kept in the app's own database, so they
// can be read before any backend runs.
//
// Cloudflare Access wants its service token in two headers, which a
// WebSocket in the renderer cannot set, so the main process adds them to
// every request for that one host. A refused WebSocket tells the page
// nothing but 1006, so after a failure the main process asks the same door
// itself and reads the status.

import { randomUUID } from 'node:crypto'
import { LOCAL_SERVER, type RemoteRefusal, type ServerInput, type ServerSettings, type ServersSettings } from '../../shared/ipc'
import type { Db } from '../db'

/** One server to connect to, as the app uses it: the address and token the
 * gateway takes, and the Access service token when it is behind Access. */
export interface ServerTarget {
  /** wss://host/ or ws://<loopback>:port/, always ending at the root. */
  url: string
  /** <secret>.<profile>, as the gateway names a connection. */
  token: string
  access: { clientId: string; clientSecret: string } | undefined
}

interface StoredServer {
  id: string
  name: string
  url: string
  token?: string
  accessClientId?: string
  accessClientSecret?: string
}

interface Stored {
  active: string
  servers: StoredServer[]
}

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]']
const MAX_SERVERS = 32
const MAX_NAME = 120
/** The key the servers are kept under, in the app's database. */
const KEY = 'servers'

/** The gateway cuts the token at its first dot: the secret before it, and
 * the profile after it, as ollupid names one. The whole token goes into the
 * WebSocket handshake as a subprotocol, which a browser only carries when
 * every character is one a subprotocol allows: no comma, space, `=`, `/`
 * or dot, and no `.` inside the secret, which is the separator. A hex
 * secret, as `openssl rand -hex 32` makes one, always fits. */
const TOKEN = /^[!#$%&'*+\-^_`|~0-9A-Za-z]+\.[A-Za-z0-9_-]{1,64}$/

export class ServerStore {
  constructor(private readonly db: Db) {}

  async read(): Promise<ServersSettings> {
    const s = this.load()
    return {
      active: s.active,
      servers: s.servers.map(
        (e): ServerSettings => ({
          id: e.id,
          name: e.name,
          url: e.url,
          accessClientId: e.accessClientId ?? '',
          hasToken: !!e.token,
          hasAccessSecret: !!e.accessClientSecret,
        }),
      ),
    }
  }

  /** The server in use; undefined runs the backend this app ships. */
  async target(): Promise<ServerTarget | undefined> {
    const s = this.load()
    if (s.active === LOCAL_SERVER) return undefined
    const entry = s.servers.find((e) => e.id === s.active)
    if (!entry?.token) return undefined
    const access = entry.accessClientId && entry.accessClientSecret ? { clientId: entry.accessClientId, clientSecret: entry.accessClientSecret } : undefined
    return { url: serverURL(entry.url), token: entry.token, access }
  }

  /** Keeps a server: a new one, or the changes to one. An empty token or
   * Access secret keeps the one already kept. */
  async save(input: ServerInput): Promise<void> {
    const stored = this.load()
    const existing = input.id ? stored.servers.find((e) => e.id === input.id) : undefined
    if (input.id && !existing) throw new Error('the server is no longer there')
    const url = serverURL(input.url)
    const token = input.token.trim()
    if (token && !TOKEN.test(token)) throw new Error('the gateway token is <secret>.<profile>, and the secret holds no dots, spaces, commas, “=” or “/” (a hex secret fits)')
    const keptToken = token || existing?.token
    if (!keptToken) throw new Error('a server needs its gateway token')
    const clientId = input.accessClientId.trim()
    const clientSecret = input.accessClientSecret.trim()
    if (/\s/.test(clientId + clientSecret)) throw new Error('the Access service token holds no spaces')
    if (clientId && !clientSecret && clientId !== (existing?.accessClientId ?? '')) throw new Error('the Access service token needs its client secret')
    const entry: StoredServer = {
      id: existing?.id ?? randomUUID(),
      name: nameOf(input.name, url),
      url,
      token: keptToken,
      accessClientId: clientId || undefined,
      accessClientSecret: clientId ? clientSecret || existing?.accessClientSecret : undefined,
    }
    const servers = existing ? stored.servers.map((e) => (e.id === entry.id ? entry : e)) : [...stored.servers, entry]
    if (servers.length > MAX_SERVERS) throw new Error(`at most ${MAX_SERVERS} servers`)
    this.write({ ...stored, servers })
  }

  /** Makes a server the one to connect to. */
  async select(id: string): Promise<void> {
    const stored = this.load()
    if (id !== LOCAL_SERVER && !stored.servers.some((e) => e.id === id)) throw new Error('the server is no longer there')
    this.write({ ...stored, active: id })
  }

  /** Forgets a server not in use: switch away first, as with a profile. */
  async remove(id: string): Promise<void> {
    const stored = this.load()
    if (id === LOCAL_SERVER) throw new Error('the backend this app runs is not removed')
    if (id === stored.active) throw new Error('switch away from a server before removing it')
    this.write({ ...stored, servers: stored.servers.filter((e) => e.id !== id) })
  }

  private load(): Stored {
    const kept = this.db.get(KEY)
    return kept ? normalise(kept) : { active: LOCAL_SERVER, servers: [] }
  }

  private write(stored: Stored): void {
    this.db.set(KEY, JSON.stringify(stored))
  }
}

/** What a server is called: the name given, or its host. */
function nameOf(name: string, url: string): string {
  const given = name.trim()
  return (given || hostOf(url)).slice(0, MAX_NAME)
}

/** A stored file's entries, with the parts this version cannot use left out,
 * and the one in use falling back to the local backend when it is gone. */
function normalise(text: string): Stored {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { active: LOCAL_SERVER, servers: [] }
  }
  const v = value as Partial<Stored> | null
  const seen = new Set<string>()
  const servers: StoredServer[] = []
  for (const entry of Array.isArray(v?.servers) ? v.servers : []) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) continue
    const text = (x: unknown) => (typeof x === 'string' && x ? x : undefined)
    const url = text(entry.url)
    if (!url) continue
    seen.add(entry.id)
    servers.push({
      id: entry.id,
      name: nameOf(text(entry.name) ?? '', url),
      url,
      token: text(entry.token),
      accessClientId: text(entry.accessClientId),
      accessClientSecret: text(entry.accessClientSecret),
    })
  }
  const chosen = typeof v?.active === 'string' ? v.active : ''
  const active = chosen === LOCAL_SERVER || servers.some((e) => e.id === chosen) ? chosen : LOCAL_SERVER
  return { active, servers }
}

/** The server's address: wss:// anywhere, or ws:// on this Mac's loopback
 * (a server started here, or an SSH tunnel). The gateway serves its
 * connections at the root. */
export function serverURL(text: string): string {
  if (!text.trim()) throw new Error('a server needs its address')
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('the server address is a wss:// URL')
  }
  const loopback = url.protocol === 'ws:' && LOOPBACK.includes(url.hostname)
  if (url.protocol !== 'wss:' && !loopback) throw new Error('the server address is a wss:// URL (ws:// only on this Mac, for a server started here or an SSH tunnel)')
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('the server address is the host alone, e.g. wss://ollupi.example.com')
  }
  return `${url.protocol}//${url.host}/`
}

/** The sources the window's CSP lets it reach: the gateway's WebSocket and
 * the same host over HTTP(S), for attachments. */
export function serverSources(target: ServerTarget): string[] {
  const ws = new URL(target.url)
  const http = `${ws.protocol === 'wss:' ? 'https:' : 'http:'}//${ws.host}`
  return [`${ws.protocol}//${ws.host}`, http]
}

/** Sends the Access service token with every request to the server's host:
 * the WebSocket handshake, the attachments and their CORS preflight. A
 * window that runs its own backend, or reaches a server outside Access,
 * sends it nowhere. */
export function sendAccessToken(webRequest: Electron.WebRequest, target: ServerTarget | undefined): void {
  const access = target?.access
  if (!target || !access) return webRequest.onBeforeSendHeaders(null)
  webRequest.onBeforeSendHeaders({ urls: serverSources(target).map((origin) => `${origin}/*`) }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret } })
  })
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** Asks the server's root as the WebSocket does, without the upgrade, and
 * says who refused it. Undefined when nobody did: the gateway took the
 * token (and answers that this is no WebSocket), or the host cannot be
 * reached, which the next attempt may get past. */
export async function serverRefusal(fetch: Fetch, target: ServerTarget): Promise<RemoteRefusal | undefined> {
  const [, http] = serverSources(target)
  const headers: Record<string, string> = { Authorization: `Bearer ${target.token}` }
  if (target.access) {
    headers['CF-Access-Client-Id'] = target.access.clientId
    headers['CF-Access-Client-Secret'] = target.access.clientSecret
  }
  let res: Response
  try {
    res = await fetch(`${http}/`, { headers, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  } catch {
    return undefined
  }
  return refusalOf(res.status, res.headers.get('location') ?? '', await res.text().catch(() => ''))
}

/** Cloudflare Access refuses with 403, or sends a request without a valid
 * service token to its login page; the gateway answers 401 for a token it
 * does not know, and 403 "host not allowed" for a Host header it does not
 * serve. */
export function refusalOf(status: number, location: string, body: string): RemoteRefusal | undefined {
  if (status === 401) return 'token'
  if (status === 403) return body.startsWith('host not allowed') ? 'host' : 'access'
  if (status >= 300 && status < 400 && /\.cloudflareaccess\.com$/.test(hostOf(location))) return 'access'
  return undefined
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
