// BackendSupervisor owns the ollupid process: it spawns it with fresh
// secrets, the gateway's and the operator's, reads the handshake line, writes its output to the log
// file and keeps the tail of it for diagnostics, and reports every state
// change. It never restarts on its own; a crash becomes a visible "failed"
// state the user can retry. When the window connects to a remote ollupid
// instead, it runs nothing: a start hands out the remote's address and
// token, and a refusal there becomes the failed state.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import type { BackendFailure, BackendState, RemoteRefusal } from '../../shared/ipc'
import type { RemoteTarget } from './remote'

export interface SupervisorOptions {
  binary: string
  home: string
  /** The profile the window acts as. The token the renderer is handed is
   * the operator's secret and this id: the backend names every connection
   * by a profile, and this app is also the operator of the backend it runs,
   * which sets the models every profile chooses among. */
  profile: string
  /** Keeps the profile the window acts as when the store no longer holds
   * the one chosen, and the first it holds stands in. */
  remember(profile: string): void
  allowOrigins: string[]
  env(): Promise<NodeJS.ProcessEnv>
  /** Where the backend's log lines go (ollupi logs ids and numbers, never
   * messages, arguments or outputs). Past LOG_FILE_BYTES at a start, the
   * file moves to <name>.old, replacing the one before. */
  logFile: string
  /** The remote ollupid to connect to instead, read at every start;
   * undefined runs the one this Mac has. */
  remote(): Promise<RemoteTarget | undefined>
  /** Who refused a connection to the remote, if anyone did. */
  refusal(target: RemoteTarget): Promise<RemoteRefusal | undefined>
}

/** sidecar/internal/handshake.Message */
interface Handshake {
  type: 'ready' | 'fatal'
  url?: string
  version?: string
  message?: string
  /** The profiles the store holds. */
  profiles?: string[]
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
  /** The remote this start connects to, instead of a child. */
  private target: RemoteTarget | undefined
  private checking: Promise<void> | undefined

  /** The operator's secret this start was given, which every token the app
   * hands out is made from. */
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
    if (this.child || this.target) return
    this.log = []
    this.set({ status: 'starting' })
    const target = await this.opts.remote()
    if (target) {
      this.target = target
      // A remote's token names its profile, as whoever runs it gave it.
      this.set({ status: 'ready', url: target.url, token: target.token, profile: target.token.slice(target.token.indexOf('.') + 1), version: '' })
      return
    }
    // The gateway's secret makes a connection a user only; nothing here
    // hands it out, but ollupid takes both. The secrets go in the
    // environment, not argv, which other users can read; the renderer is
    // handed the operator's secret and its profile together.
    const secret = randomBytes(32).toString('hex')
    this.secret = secret
    const env = { ...(await this.opts.env()), OLLUPI_GATEWAY_TOKEN: randomBytes(32).toString('hex'), OLLUPI_OPERATOR_TOKEN: secret }
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
      if (msg.type === 'ready' && msg.url) {
        const held = msg.profiles ?? []
        if (held.length && !held.includes(this.profile)) {
          this.profile = held[0]!
          this.opts.remember(this.profile)
        }
        this.set({ status: 'ready', url: msg.url, token: this.tokenFor(this.profile), profile: this.profile, version: msg.version ?? '' })
      }
      else this.fail({ kind: 'reported', message: msg.message })
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

  /** The token for a profile of this backend: the operator's secret and the
   * profile, as a connection is named. */
  tokenFor(profile: string): string {
    if (!this.secret) throw new Error('the backend is not running')
    return `${this.secret}.${profile}`
  }

  /** Makes the next connection another profile: the app's token changes with
   * it, and the renderer reconnects under the new one. */
  selectProfile(profile: string): void {
    this.profile = profile
    // A remote's token names its profile, as whoever runs it gave it.
    if (this.current.status !== 'ready' || this.target) return
    this.set({ ...this.current, token: this.tokenFor(profile), profile })
  }

  /** After a connection to the remote failed: a refusal there is no
   * reason to keep trying, so it ends in the failed state. One check at a
   * time; the backend this Mac runs reports its own failures. */
  check(): Promise<void> {
    this.checking ??= this.askRemote().finally(() => {
      this.checking = undefined
    })
    return this.checking
  }

  private async askRemote(): Promise<void> {
    const target = this.target
    if (!target || this.current.status !== 'ready') return
    const refused = await this.opts.refusal(target)
    if (refused && this.target === target && this.current.status === 'ready') this.fail({ kind: 'remote', refused, url: target.url })
  }

  /** SIGTERM lets the backend finish its writes; SIGKILL if it hangs. A
   * remote is only let go. */
  async stop(): Promise<void> {
    if (this.target) {
      this.target = undefined
      this.set({ status: 'stopped' })
      return
    }
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

  private fail(failure: BackendFailure): void {
    if (this.current.status === 'failed') return
    this.set({ status: 'failed', failure, log: this.log.join('\n') })
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
