// Where the backend binary and data live, and the environment it runs with.
// Apps started from Finder or the Dock get launchd's minimal environment, so
// we borrow the user's login-shell environment once (PATH for the shell tool,
// API keys referenced by api_key_env).

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function backendBinary(): string {
  const name = process.platform === 'win32' ? 'ollupid.exe' : 'ollupid'
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', name)
    : join(app.getAppPath(), 'resources', 'bin', name)
}

export function backendHome(): string {
  return process.env.OLLUPI_HOME || join(homedir(), '.ollupi')
}

let cached: Promise<NodeJS.ProcessEnv> | undefined

export function backendEnv(): Promise<NodeJS.ProcessEnv> {
  cached ??= loginShellEnv().then((shellEnv) => ({ ...shellEnv, ...process.env, PATH: shellEnv.PATH ?? process.env.PATH }))
  return cached
}

function loginShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') return Promise.resolve({})
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', 'env -0'], { timeout: 5000, maxBuffer: 4 << 20 }, (err, stdout) => {
      if (err) return resolve({})
      const env: NodeJS.ProcessEnv = {}
      for (const entry of stdout.split('\0')) {
        const eq = entry.indexOf('=')
        if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1)
      }
      resolve(env)
    })
  })
}
