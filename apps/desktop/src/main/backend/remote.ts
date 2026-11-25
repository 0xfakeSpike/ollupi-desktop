// A remote ollupid: one running on another machine (a Mac mini at home,
// behind a Cloudflare Tunnel) that this window connects to instead of the
// one this Mac runs. What it takes is kept in remote.json, the token and
// the Access service token encrypted with the system keychain's key.
//
// Cloudflare Access wants its service token in two headers, which a
// WebSocket in the renderer cannot set, so the main process adds them to
// every request for that one host. A refused WebSocket tells the page
// nothing but 1006, so after a failure the main process asks the same door
// itself and reads the status.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RemoteInput, RemoteRefusal, RemoteSettings } from '../../shared/ipc'

export interface RemoteTarget {
  /** wss://host/ or ws://127.0.0.1:port/, always ending at the root. */
  url: string
  token: string
  access: { clientId: string; clientSecret: string } | undefined
}

/** safeStorage, or a stand-in in tests. */
export type Sealer = Pick<Electron.SafeStorage, 'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'>

interface Stored {
  enabled: boolean
  url: string
  token?: string
  accessClientId?: string
  accessClientSecret?: string
}

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]']

/** The gateway cuts the token at its first dot: the secret before it, and
 * the profile after it, as ollupid names one. */
const TOKEN = /^[^.\s]+\.[A-Za-z0-9_-]{1,64}$/

export class RemoteStore {
  constructor(
    private readonly file: string,
    private readonly sealer: Sealer,
  ) {}

  async read(): Promise<RemoteSettings> {
    const s = await this.load()
    return {
      enabled: s.enabled,
      url: s.url,
      accessClientId: (await this.open(s.accessClientId)) ?? '',
      hasToken: !!s.token,
      hasAccessSecret: !!s.accessClientSecret,
    }
  }

  /** The remote to connect to; undefined when the window runs its own. */
  async target(): Promise<RemoteTarget | undefined> {
    const s = await this.load()
    const token = await this.open(s.token)
    if (!s.enabled || !token) return undefined
    const clientId = await this.open(s.accessClientId)
    const clientSecret = await this.open(s.accessClientSecret)
    return { url: s.url, token, access: clientId && clientSecret ? { clientId, clientSecret } : undefined }
  }

  async save(input: RemoteInput): Promise<void> {
    if (!(await this.sealer.isAsyncEncryptionAvailable())) throw new Error('this Mac cannot encrypt the remote secrets: the keychain is unavailable')
    const before = await this.load()
    const url = input.url.trim() ? remoteURL(input.url) : ''
    const token = input.token.trim()
    if (token && !TOKEN.test(token)) throw new Error('the gateway token is <secret>.<profile>')
    const clientId = input.accessClientId.trim()
    const clientSecret = input.accessClientSecret.trim()
    if (/\s/.test(clientId + clientSecret)) throw new Error('the Access service token holds no spaces')
    const next: Stored = {
      enabled: input.enabled,
      url,
      token: token ? await this.seal(token) : before.token,
      accessClientId: clientId ? await this.seal(clientId) : undefined,
      accessClientSecret: !clientId ? undefined : clientSecret ? await this.seal(clientSecret) : before.accessClientSecret,
    }
    if (next.enabled && !url) throw new Error('a remote ollupid needs its address')
    if (next.enabled && !next.token) throw new Error('a remote ollupid needs its gateway token')
    if (clientId && !next.accessClientSecret) throw new Error('the Access service token needs its client secret')
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 })
    await rename(`${this.file}.tmp`, this.file)
  }

  private async load(): Promise<Stored> {
    try {
      const s = JSON.parse(await readFile(this.file, 'utf8')) as Partial<Stored>
      const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
      return { enabled: s.enabled === true, url: text(s.url) ?? '', token: text(s.token), accessClientId: text(s.accessClientId), accessClientSecret: text(s.accessClientSecret) }
    } catch {
      return { enabled: false, url: '' }
    }
  }

  private async seal(plain: string): Promise<string> {
    return (await this.sealer.encryptStringAsync(plain)).toString('base64')
  }

  /** undefined for nothing kept, and for what this Mac's key cannot open
   * (a file copied from another Mac): it is entered again. */
  private async open(sealed: string | undefined): Promise<string | undefined> {
    if (!sealed) return undefined
    try {
      return (await this.sealer.decryptStringAsync(Buffer.from(sealed, 'base64'))).result
    } catch {
      return undefined
    }
  }
}

/** The gateway's address: wss:// anywhere, or ws:// on this Mac's loopback
 * (an SSH tunnel). The gateway serves its connections at the root. */
export function remoteURL(text: string): string {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('the remote address is a wss:// URL')
  }
  const loopback = url.protocol === 'ws:' && LOOPBACK.includes(url.hostname)
  if (url.protocol !== 'wss:' && !loopback) throw new Error('the remote address is a wss:// URL (ws:// only on this Mac, for an SSH tunnel)')
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('the remote address is the host alone, e.g. wss://ollupi.example.com')
  }
  return `${url.protocol}//${url.host}/`
}

/** The sources the window's CSP lets it reach: the gateway's WebSocket and
 * the same host over HTTP(S), for attachments. */
export function remoteSources(target: RemoteTarget): string[] {
  const ws = new URL(target.url)
  const http = `${ws.protocol === 'wss:' ? 'https:' : 'http:'}//${ws.host}`
  return [`${ws.protocol}//${ws.host}`, http]
}

/** The URL patterns of every request to the remote host. */
export function remoteFilter(target: RemoteTarget): string[] {
  return remoteSources(target).map((origin) => `${origin}/*`)
}

/** Sends the Access service token with every request to the remote host:
 * the WebSocket handshake, the attachments and their CORS preflight. A
 * window that runs its own backend sends it nowhere. */
export function sendAccessToken(webRequest: Electron.WebRequest, target: RemoteTarget | undefined): void {
  const access = target?.access
  if (!target || !access) return webRequest.onBeforeSendHeaders(null)
  webRequest.onBeforeSendHeaders({ urls: remoteFilter(target) }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret } })
  })
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** Asks the remote's root as the WebSocket does, without the upgrade, and
 * says who refused it. Undefined when nobody did: the gateway took the
 * token (and answers that this is no WebSocket), or the host cannot be
 * reached, which the next attempt may get past. */
export async function remoteRefusal(fetch: Fetch, target: RemoteTarget): Promise<RemoteRefusal | undefined> {
  const [, http] = remoteSources(target)
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
