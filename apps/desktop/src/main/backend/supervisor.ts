// BackendSupervisor owns the ollupid process: it spawns it with a fresh
// gateway token, reads the one-line handshake, keeps the tail of its stderr for
// diagnostics and reports every state change. It never restarts on its own; a
// crash becomes a visible "failed" state the user can retry.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { BackendState } from '../../shared/ipc'

export interface SupervisorOptions {
  binary: string
  home: string
  allowOrigins: string[]
  env: () => Promise<NodeJS.ProcessEnv>
}

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

export class BackendSupervisor extends EventEmitter<{ state: [BackendState] }> {
  private child: ChildProcess | undefined
  private current: BackendState = { status: 'stopped' }
  private log: string[] = []

  constructor(private readonly opts: SupervisorOptions) {
    super()
  }

  get state(): BackendState {
    return this.current
  }

  async start(): Promise<void> {
    if (this.child) return
    this.log = []
    this.set({ status: 'starting' })
    const token = randomBytes(32).toString('hex')
    const env = { ...(await this.opts.env()), OLLUPI_GATEWAY_TOKEN: token }
    const args = ['--home', this.opts.home, '--watch-stdin']
    if (this.opts.allowOrigins.length) args.push('--allow-origin', this.opts.allowOrigins.join(','))

    let child: ChildProcess
    try {
      child = spawn(this.opts.binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      this.fail(`cannot start ${this.opts.binary}: ${String(err)}`)
      return
    }
    this.child = child
    let handshaken = false
    const timer = setTimeout(() => {
      if (handshaken) return
      this.fail('the backend did not report ready within 30s')
      child.kill('SIGKILL')
    }, HANDSHAKE_TIMEOUT_MS)

    createInterface({ input: child.stderr! }).on('line', (line) => this.remember(line))
    createInterface({ input: child.stdout! }).on('line', (line) => {
      if (handshaken) return this.remember(line)
      const msg = parseHandshake(line)
      if (!msg) return this.remember(line)
      handshaken = true
      clearTimeout(timer)
      if (msg.type === 'ready' && msg.url) {
        this.set({ status: 'ready', url: msg.url, token, version: msg.version ?? '' })
      } else {
        this.fail(msg.message ?? 'the backend failed to start', msg.configPath)
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      this.fail(`cannot start the backend: ${err.message}`)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (this.child === child) this.child = undefined
      if (this.current.status === 'ready' || this.current.status === 'starting') {
        this.fail(`the backend exited unexpectedly (${signal ?? `code ${code}`})`)
      }
    })
  }

  /** Asks the backend to finish in-flight writes, then forces it down. */
  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = undefined
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

  private fail(message: string, configPath?: string): void {
    if (this.current.status === 'failed') return
    this.set({ status: 'failed', message, configPath, log: this.log.join('\n') })
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
