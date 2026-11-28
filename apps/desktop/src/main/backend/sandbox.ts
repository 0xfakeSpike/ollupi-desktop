// A Cloudflare sandbox bridge the backend this Mac runs offers to its
// environments: one container per environment, where a conversation's
// commands run instead of on this Mac. The bridge's address and token are
// kept in sandbox.json, the token sealed with this Mac's keychain, and handed
// to the backend as SANDBOX_API_URL and SANDBOX_API_KEY, as `ollupi serve`
// reads its own.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SandboxInput, SandboxSettings } from '../../shared/ipc'
import type { Sealer } from './servers'

/** The bridge as the backend is given it. */
export interface SandboxTarget {
  url: string
  key: string
}

interface Stored {
  url: string
  key?: string
}

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]']

export class SandboxStore {
  constructor(
    private readonly file: string,
    private readonly sealer: Sealer,
  ) {}

  async read(): Promise<SandboxSettings> {
    const stored = await this.load()
    return { url: stored?.url ?? '', hasKey: !!stored?.key }
  }

  /** The variables the backend starts with, and none when no bridge is
   * kept, so one exported in the shell stays in force. A token this Mac's
   * key cannot open costs the bridge, not the backend. */
  async env(): Promise<Record<string, string>> {
    try {
      const target = await this.target()
      return target ? { SANDBOX_API_URL: target.url, SANDBOX_API_KEY: target.key } : {}
    } catch (err) {
      console.error('the sandbox bridge is not offered', err)
      return {}
    }
  }

  /** Keeps the bridge; an empty token keeps the one already kept. */
  async save(input: SandboxInput): Promise<void> {
    if (!(await this.sealer.isAsyncEncryptionAvailable())) throw new Error('this Mac cannot encrypt the sandbox token: the keychain is unavailable')
    const url = bridgeURL(input.url)
    const key = input.key.trim()
    if (/\s/.test(key)) throw new Error('the sandbox token holds no spaces')
    const sealed = key ? await this.seal(key) : (await this.load())?.key
    if (!sealed) throw new Error('a sandbox bridge needs its token')
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(`${this.file}.tmp`, JSON.stringify({ url, key: sealed }, null, 2), { mode: 0o600 })
    await rename(`${this.file}.tmp`, this.file)
  }

  /** Stops offering the bridge. Environments built on it stay in the store
   * and stop working, which the person is told before this runs. */
  async clear(): Promise<void> {
    await rm(this.file, { force: true })
  }

  private async target(): Promise<SandboxTarget | undefined> {
    const stored = await this.load()
    if (!stored) return undefined
    const key = stored.key && (await this.open(stored.key))
    if (!key) throw new Error('the saved sandbox token cannot be read on this Mac; enter it again')
    return { url: stored.url, key }
  }

  private async load(): Promise<Stored | undefined> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<Stored> | null
      if (typeof raw?.url !== 'string' || !raw.url) return undefined
      return { url: raw.url, key: typeof raw.key === 'string' && raw.key ? raw.key : undefined }
    } catch {
      // No bridge yet, or one this version cannot read.
      return undefined
    }
  }

  private async seal(plain: string): Promise<string> {
    return (await this.sealer.encryptStringAsync(plain)).toString('base64')
  }

  private async open(sealed: string): Promise<string | undefined> {
    try {
      return (await this.sealer.decryptStringAsync(Buffer.from(sealed, 'base64'))).result
    } catch {
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
