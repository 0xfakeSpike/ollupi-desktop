// Updates the packaged app from GitHub Releases. The latest release's
// latest-mac.yml (written by electron-builder) names each arch's zip with its
// size and sha512. Once the person agrees, this arch's zip is downloaded,
// checked and unpacked; the bundle is swapped in after the app quits, and
// the app reopens when the person asked to restart. Squirrel.Mac would refuse
// every update: the app is signed ad hoc, so no two versions share a
// designated requirement.

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { access, constants, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { RELEASES_URL, type UpdateFailure, type UpdateState } from '../shared/ipc'

const run = promisify(execFile)

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
/** A download that receives nothing for this long is given up. */
const STALL_MS = 60_000

/** The zip this arch updates from, as latest-mac.yml lists it. */
export interface ReleaseFile {
  version: string
  url: string
  sha512: string
  size: number
}

export interface UpdaterOptions {
  fetch(url: string, init: RequestInit): Promise<Response>
  /** The running app's version and arch. */
  version: string
  arch: string
  /** The installed .app; undefined when not running from one (development),
   * which has nothing to update. */
  bundle: string | undefined
  /** Where downloads are unpacked; cleared at start. */
  staging: string
  /** Quits the app; quitting installs a downloaded update. */
  quit(): void
}

export class AppUpdater extends EventEmitter<{ state: [UpdateState] }> {
  private current: UpdateState
  private release: ReleaseFile | undefined
  /** The unpacked bundle that replaces the installed one at quit. */
  private staged: string | undefined
  private relaunch = false

  constructor(private readonly opts: UpdaterOptions) {
    super()
    this.current = opts.bundle ? { status: 'idle' } : { status: 'unsupported' }
  }

  get state(): UpdateState {
    return this.current
  }

  /** Checks now and every few hours after. */
  start(): void {
    if (!this.opts.bundle) return
    void rm(this.opts.staging, { recursive: true, force: true }).then(() => this.check())
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref()
  }

  async check(): Promise<void> {
    const s = this.current.status
    if (!this.opts.bundle || s === 'checking' || s === 'downloading' || s === 'ready') return
    this.set({ status: 'checking' })
    try {
      const res = await this.opts.fetch(`${RELEASES_URL}/latest/download/latest-mac.yml`, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`latest-mac.yml: HTTP ${res.status}`)
      const latest = releaseFile(parse(await res.text()), this.opts.arch)
      if (!newer(latest.version, this.opts.version)) {
        this.release = undefined
        this.set({ status: 'latest' })
        return
      }
      this.release = latest
      this.set({ status: 'available', version: latest.version })
    } catch (err) {
      this.release = undefined
      this.set({ status: 'failed', version: undefined, failure: reported(err) })
    }
  }

  /** Downloads the release found and unpacks it; it is installed at quit. */
  async download(): Promise<void> {
    const release = this.release
    const bundle = this.opts.bundle
    const s = this.current.status
    if (!release || !bundle || (s !== 'available' && s !== 'failed')) return
    this.set({ status: 'downloading', version: release.version, received: 0, total: release.size })
    try {
      // The bundle is replaced by moving it: its folder must be writable,
      // which a mounted dmg or a translocated app is not.
      await access(dirname(bundle), constants.W_OK).catch(() => {
        throw new LocationError(bundle)
      })
      const dir = join(this.opts.staging, release.version)
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      const zip = join(dir, 'update.zip')
      await this.fetchFile(release, zip)
      await run('/usr/bin/ditto', ['-x', '-k', zip, dir])
      await rm(zip)
      this.staged = await unpackedBundle(dir, bundle, release.version)
      this.set({ status: 'ready', version: release.version })
    } catch (err) {
      this.set({ status: 'failed', version: release.version, failure: reported(err) })
    }
  }

  /** Quits and reopens the app on the downloaded version. */
  restart(): void {
    if (this.current.status !== 'ready') return
    this.relaunch = true
    this.opts.quit()
  }

  /** Called as the app quits: swaps in a downloaded update once this
   * process has exited. */
  install(): void {
    if (!this.staged || !this.opts.bundle) return
    swapIn(this.staged, this.opts.bundle, process.pid, this.relaunch)
  }

  private async fetchFile(release: ReleaseFile, file: string): Promise<void> {
    const stall = new AbortController()
    let timer = setTimeout(() => stall.abort(), STALL_MS)
    const res = await this.opts.fetch(`${RELEASES_URL}/download/v${release.version}/${release.url}`, { signal: stall.signal })
    if (!res.ok || !res.body) throw new Error(`${release.url}: HTTP ${res.status}`)
    const hash = createHash('sha512')
    let received = 0
    let shown = 0
    const count = new Transform({
      transform: (chunk: Buffer, _enc, done) => {
        clearTimeout(timer)
        timer = setTimeout(() => stall.abort(), STALL_MS)
        hash.update(chunk)
        received += chunk.length
        // Progress in whole percents, not every chunk.
        if (Math.floor((received * 100) / release.size) > shown) {
          shown = Math.floor((received * 100) / release.size)
          this.set({ status: 'downloading', version: release.version, received, total: release.size })
        }
        done(null, chunk)
      },
    })
    try {
      await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), count, createWriteStream(file))
    } finally {
      clearTimeout(timer)
    }
    if (received !== release.size || hash.digest('base64') !== release.sha512) {
      throw new Error(`${release.url} does not match its checksum in latest-mac.yml`)
    }
  }

  private set(state: UpdateState): void {
    this.current = state
    this.emit('state', state)
  }
}

/** The .app a path inside it belongs to: the executable is
 * Ollupi.app/Contents/MacOS/Ollupi. */
export function bundleOf(executable: string): string | undefined {
  const bundle = resolve(executable, '../../..')
  return bundle.endsWith('.app') ? bundle : undefined
}

/** latest-mac.yml's version and the zip it lists for arch, which
 * electron-builder names …-<arch>.zip. */
export function releaseFile(manifest: unknown, arch: string): ReleaseFile {
  const m = manifest as { version?: unknown; files?: unknown } | null
  if (typeof m?.version !== 'string' || !Array.isArray(m.files)) throw new Error('latest-mac.yml has no version and files')
  const file = (m.files as { url?: unknown; sha512?: unknown; size?: unknown }[]).find(
    (f) => typeof f?.url === 'string' && f.url.endsWith(`-${arch}.zip`),
  )
  if (!file) throw new Error(`The release has no zip for ${arch}`)
  if (typeof file.sha512 !== 'string' || !Number.isInteger(file.size)) throw new Error(`latest-mac.yml gives ${file.url} no sha512 and size`)
  return { version: m.version, url: file.url as string, sha512: file.sha512, size: file.size as number }
}

/** Whether version a is later than b; both x.y.z. A version of any other
 * form, such as a prerelease, is never later. */
export function newer(a: string, b: string): boolean {
  const pa = semver(a)
  const pb = semver(b)
  if (!pa || !pb) return false
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! > pb[i]!
  return false
}

function semver(v: string): number[] | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  return m ? m.slice(1).map(Number) : undefined
}

/** The one .app the zip unpacked, checked to be this app at the release's
 * version. */
async function unpackedBundle(dir: string, installed: string, version: string): Promise<string> {
  const apps = (await readdir(dir)).filter((n) => n.endsWith('.app'))
  if (apps.length !== 1) throw new Error(`The zip holds ${apps.length} apps`)
  const staged = join(dir, apps[0]!)
  const [id, stagedId, stagedVersion] = await Promise.all([
    plistValue(installed, 'CFBundleIdentifier'),
    plistValue(staged, 'CFBundleIdentifier'),
    plistValue(staged, 'CFBundleShortVersionString'),
  ])
  if (stagedId !== id) throw new Error(`The zip holds ${stagedId}, not ${id}`)
  if (stagedVersion !== version) throw new Error(`The zip holds version ${stagedVersion}, not ${version}`)
  return staged
}

async function plistValue(bundle: string, key: string): Promise<string> {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')])
  return stdout.trim()
}

/** Waits for pid to exit, then moves the staged bundle into the installed
 * one's place; when that fails the installed one is put back. Detached, so it
 * outlives the app. */
export function swapIn(staged: string, bundle: string, pid: number, relaunch: boolean) {
  const script = `
    while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
    [ -d "$2/Contents" ] || exit 1
    old="$(dirname "$3")/.$(basename "$3").old-$$"
    if mv "$3" "$old"; then
      if mv "$2" "$3"; then rm -rf "$old"; else rm -rf "$3"; mv "$old" "$3"; fi
    fi
    [ "$4" = 1 ] && open "$3"
    exit 0
  `
  const child = spawn('/bin/sh', ['-c', script, 'ollupi-update', String(pid), staged, bundle, relaunch ? '1' : '0'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

class LocationError extends Error {
  constructor(readonly path: string) {
    super(`${path} cannot be replaced`)
  }
}

function reported(err: unknown): UpdateFailure {
  if (err instanceof LocationError) return { kind: 'location', path: err.path }
  return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
}
