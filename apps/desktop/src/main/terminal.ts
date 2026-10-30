// The person's own terminals: a login shell per workspace, opened in its
// folder, beside the conversation. They are the person's, not the agent's:
// nothing here goes through ollupi, its permissions or its sandbox. A shell
// lives until it exits or the app quits; closing the panel only hides it, so
// its output since it started (the last part of it) is kept to show again.

import { EventEmitter } from 'node:events'
import { isAbsolute } from 'node:path'
import { spawn, type IPty } from 'node-pty'

/** About what a screenful of scrollback holds many times over. */
const KEPT = 256 * 1024

interface Shell {
  pty: IPty
  output: string
}

/** Emits data (key, text) and exit (key, code). */
export class Terminals extends EventEmitter {
  private readonly shells = new Map<string, Shell>()

  /** The terminal under key, started in cwd unless it runs; answers what it
   * printed so far, to draw before what follows. */
  open(key: string, cwd: string, cols: number, rows: number): string {
    const running = this.shells.get(key)
    if (running) {
      running.pty.resize(cols, rows)
      return running.output
    }
    if (!isAbsolute(cwd)) throw new Error('expected an absolute folder')
    const shell = process.env.SHELL || '/bin/zsh'
    const pty = spawn(shell, ['-l'], { cwd, cols, rows, name: 'xterm-256color', env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } })
    const entry: Shell = { pty, output: '' }
    this.shells.set(key, entry)
    // A shell closed on purpose has been replaced: what it still prints, and
    // its end, are not the terminal's any more.
    pty.onData((text) => {
      if (this.shells.get(key) !== entry) return
      entry.output = (entry.output + text).slice(-KEPT)
      this.emit('data', key, text)
    })
    pty.onExit(({ exitCode }) => {
      if (this.shells.get(key) !== entry) return
      this.shells.delete(key)
      this.emit('exit', key, exitCode)
    })
    return ''
  }

  write(key: string, text: string): void {
    this.shells.get(key)?.pty.write(text)
  }

  resize(key: string, cols: number, rows: number): void {
    this.shells.get(key)?.pty.resize(cols, rows)
  }

  /** Ends the shell; the next open starts a new one. */
  close(key: string): void {
    const entry = this.shells.get(key)
    this.shells.delete(key)
    entry?.pty.kill()
  }

  closeAll(): void {
    for (const s of this.shells.values()) s.pty.kill()
  }
}
