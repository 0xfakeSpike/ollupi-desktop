// Where the backend binary and data live, and the environment it runs in.
// An app started from Finder or the Dock gets launchd's minimal environment,
// so the user's login-shell environment is read once and merged under the
// inherited one: a variable set in the launching terminal wins over the
// shell profile.

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function backendBinary(): string {
  const name = process.platform === 'win32' ? 'ollupid.exe' : 'ollupid'
  return app.isPackaged ? join(process.resourcesPath, 'bin', name) : join(app.getAppPath(), 'resources', 'bin', name)
}

export function backendHome(): string {
  return process.env.OLLUPI_HOME || join(homedir(), '.ollupi')
}

let cached: Promise<NodeJS.ProcessEnv> | undefined

export function backendEnv(): Promise<NodeJS.ProcessEnv> {
  cached ??= loginShellEnv().then((shell) => ({ ...shell, ...process.env, PATH: shell.PATH ?? process.env.PATH }))
  return cached
}

function loginShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') return Promise.resolve({})
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    // Its own session (detached): an interactive shell would otherwise take
    // over the launching terminal's foreground group and keep Ctrl-C there
    // from reaching the app.
    const child = spawn(shell, ['-ilc', 'env -0'], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.on('error', () => resolve({}))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return resolve({})
      const env: NodeJS.ProcessEnv = {}
      for (const entry of Buffer.concat(chunks).toString().split('\0')) {
        const eq = entry.indexOf('=')
        if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1)
      }
      resolve(env)
    })
  })
}
