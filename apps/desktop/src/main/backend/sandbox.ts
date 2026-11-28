// A Cloudflare sandbox bridge the backend this Mac runs offers to its
// environments: one container per environment, where a conversation's
// commands run instead of on this Mac. The bridge's address and token are
// kept in the app's database, and handed to the backend as SANDBOX_API_URL
// and SANDBOX_API_KEY, as `ollupi serve` reads its own.

import type { SandboxInput, SandboxSettings } from '../../shared/ipc'
import type { Db } from '../db'

interface Stored {
  url: string
  key?: string
}

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]']
/** The key the bridge is kept under, in the app's database. */
const KEY = 'sandbox'

export class SandboxStore {
  constructor(private readonly db: Db) {}

  async read(): Promise<SandboxSettings> {
    const stored = this.load()
    return { url: stored?.url ?? '', hasKey: !!stored?.key }
  }

  /** The variables the backend starts with, and none when no bridge is
   * kept, so one exported in the shell stays in force. */
  async env(): Promise<Record<string, string>> {
    const stored = this.load()
    return stored?.key ? { SANDBOX_API_URL: stored.url, SANDBOX_API_KEY: stored.key } : {}
  }

  /** Keeps the bridge; an empty token keeps the one already kept. */
  async save(input: SandboxInput): Promise<void> {
    const url = bridgeURL(input.url)
    const key = input.key.trim()
    if (/\s/.test(key)) throw new Error('the sandbox token holds no spaces')
    const kept = key || this.load()?.key
    if (!kept) throw new Error('a sandbox bridge needs its token')
    this.db.set(KEY, JSON.stringify({ url, key: kept }))
  }

  /** Stops offering the bridge. Environments built on it stay in the store
   * and stop working, which the person is told before this runs. */
  async clear(): Promise<void> {
    this.db.delete(KEY)
  }

  private load(): Stored | undefined {
    const raw = this.db.get(KEY)
    if (!raw) return undefined
    try {
      const v = JSON.parse(raw) as Partial<Stored> | null
      if (typeof v?.url !== 'string' || !v.url) return undefined
      return { url: v.url, key: typeof v.key === 'string' && v.key ? v.key : undefined }
    } catch {
      // One this version cannot read.
      return undefined
    }
  }
}

/** The bridge's address: https:// anywhere, or http:// on this Mac's loopback
 * (a bridge started here). The backend asks the bridge for /v1/… at that
 * host, so it is the host alone. */
export function bridgeURL(text: string): string {
  if (!text.trim()) throw new Error('a sandbox bridge needs its address')
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('the sandbox address is an https:// URL')
  }
  const loopback = url.protocol === 'http:' && LOOPBACK.includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) throw new Error('the sandbox address is an https:// URL (http:// only on this Mac)')
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('the sandbox address is the host alone, e.g. https://sandbox-bridge.example.workers.dev')
  }
  return `${url.protocol}//${url.host}`
}
