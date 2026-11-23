// BackendSupervisor owns the ollupid process: it spawns it with a fresh
// gateway token, reads the handshake line, writes its output to the log
// file and keeps the tail of it for diagnostics, and reports every state
// change. It never restarts on its own; a crash becomes a visible "failed"
// state the user can retry.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import type { BackendFailure, BackendState } from '../../shared/ipc'

export interface SupervisorOptions {
  binary: string
  home: string
  /** The profile the window acts as. The token the renderer is handed is
   * the secret and this id: the backend names every connection by a profile
   * it holds, and refuses one it does not. */
  profile: string
  allowOrigins: string[]
  env(): Promise<NodeJS.ProcessEnv>
  /** Where the backend's log lines go (ollupi logs ids and numbers, never
   * messages, arguments or outputs). Past LOG_FILE_BYTES at a start, the
   * file moves to <name>.old, replacing the one before. */
  logFile: string
}

/** sidecar/internal/handshake.Message */
interface Handshake {
  type: 'ready' | 'fatal'
  url?: string
  version?: string
  message?: string
  configPath?: string
}

const HANDSHAKE_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 6_000
const LOG_LINES = 200
const LOG_FILE_BYTES = 10 << 20

export class BackendSupervisor extends EventEmitter<{ state: [BackendState] }> {
  private child: ChildProcess | undefined
  private current: BackendState = { status: 'stopped' }
  private log: string[] = []
  private starting: Promise<void> | undefined

  /** The secret this start was given, which every token is made from. */
  private secret: string | undefined
  /** The profile new connections act as; the choice may change while it runs. */
  private profile: string

  constructor(private readonly opts: SupervisorOptions) {
    super()
    this.profile = opts.profile
  }

  get state(): BackendState {
    return this.current
  }

  /** One at a time: a start has no child to show until the environment is
   * read, and a second one then would spawn a backend nobody stops. */
  start(): Promise<void> {
    this.starting ??= this.launch().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async launch(): Promise<void> {
    if (this.child) return
    this.log = []
    this.set({ status: 'starting' })
    const secret = randomBytes(32).toString('hex')
    this.secret = secret
    // The secret goes in the environment, not argv, which other users can
    // read; the renderer is handed the secret and its profile together.
    const env = { ...(await this.opts.env()), OLLUPI_GATEWAY_TOKEN: secret }
    const token = this.tokenFor(this.profile)
    const args = ['--home', this.opts.home, '--watch-stdin']
    if (this.opts.allowOrigins.length) args.push('--allow-origin', this.opts.allowOrigins.join(','))

    const file = await openLog(this.opts.logFile)
    const child = spawn(this.opts.binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    const remember = (line: string) => {
      file?.write(line + '\n')
      this.remember(line)
    }
    let handshaken = false
    const timer = setTimeout(() => {
      if (handshaken) return
      this.fail({ kind: 'timeout', seconds: HANDSHAKE_TIMEOUT_MS / 1000 })
      child.kill('SIGKILL')
    }, HANDSHAKE_TIMEOUT_MS)

    createInterface({ input: child.stderr! }).on('line', remember)
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const msg = handshaken ? undefined : parseHandshake(line)
      if (!msg) return remember(line)
      handshaken = true
      clearTimeout(timer)
      if (msg.type === 'ready' && msg.url) this.set({ status: 'ready', url: msg.url, token, version: msg.version ?? '' })
      else this.fail({ kind: 'reported', message: msg.message }, msg.configPath)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      this.fail({ kind: 'spawn', binary: this.opts.binary, error: err.message })
    })
    child.on('close', () => file?.end())
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (this.child === child) this.child = undefined
      if (this.current.status === 'ready' || this.current.status === 'starting') {
        this.fail({ kind: 'exited', how: signal ?? `code ${code}` })
      }
    })
  }

  /** The token for a profile of this backend: its secret and the profile, as
   * a connection is named. */
  tokenFor(profile: string): string {
    if (!this.secret) throw new Error('the backend is not running')
    return `${this.secret}.${profile}`
  }

  /** Makes the next connection another profile: the app's token changes with
   * it, and the renderer reconnects under the new one. */
  selectProfile(profile: string): void {
    this.profile = profile
    if (this.current.status !== 'ready') return
    this.set({ ...this.current, token: this.tokenFor(profile) })
  }

  /** SIGTERM lets the backend finish its writes; SIGKILL if it hangs. */
  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = undefined
    this.secret = undefined
    this.set({ status: 'stopped' })
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(force)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  private fail(failure: BackendFailure, configPath?: string): void {
    if (this.current.status === 'failed') return
    this.set({ status: 'failed', failure, configPath, log: this.log.join('\n') })
  }

  private remember(line: string): void {
    this.log.push(line)
    if (this.log.length > LOG_LINES) this.log.shift()
  }

  private set(state: BackendState): void {
    this.current = state
    this.emit('state', state)
  }
}

function parseHandshake(line: string): Handshake | undefined {
  try {
    const msg = JSON.parse(line) as Handshake
    return msg.type === 'ready' || msg.type === 'fatal' ? msg : undefined
  } catch {
    return undefined
  }
}

/** The log file to append to; undefined when it cannot be opened, as the
 * backend runs without it. */
async function openLog(path: string): Promise<WriteStream | undefined> {
  try {
    await mkdir(dirname(path), { recursive: true })
    const size = await stat(path).then((s) => s.size, () => 0)
    if (size > LOG_FILE_BYTES) await rename(path, `${path}.old`)
    const stream = createWriteStream(path, { flags: 'a' })
    stream.on('error', () => {})
    return stream
  } catch {
    return undefined
  }
}
