// The backend's config.yaml, through the main process. ollupi reads it only
// at start, so applying a change restarts the backend; the main process
// first checks the changed file with the backend itself.

import { isWorking } from '@ollupi/core'
import type { BackendConfig, ConfigChange, ConfigCheck } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'
import { notify } from './notices'
import { useThreads } from './threads'

export type { BackendConfig }

export function readConfig(): Promise<ConfigCheck | undefined> {
  return run('Could not read config.yaml', () => desktop.config.read())
}

/** Applies changes and restarts the backend. A restart stops commands that
 * are executing (ollupi marks them as possibly done), so with threads
 * running it asks first. Resolves to the config now in effect, or
 * undefined when nothing was applied. */
export async function applyConfig(changes: ConfigChange[]): Promise<BackendConfig | undefined> {
  const running = useThreads.getState().list.filter((t) => isWorking(t.status)).length
  if (running && !confirm(`${running} thread${running === 1 ? ' is' : 's are'} running. Restarting the backend stops commands they are executing. Continue?`)) {
    return undefined
  }
  const result = await run('Could not save config.yaml', () => desktop.config.apply(changes))
  if (!result) return undefined
  if (!result.ok) {
    notify(`config.yaml was not changed: ${result.error}`)
    return undefined
  }
  return result.config
}
