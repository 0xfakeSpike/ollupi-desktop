// The backend's config.yaml, through the main process. ollupi reads it only
// at start, so applying a change restarts the backend; the main process
// first checks the changed file with the backend itself.

import { isWorking } from '@ollupi/core'
import type { BackendConfig, ConfigChange, ConfigCheck, ConfigModel } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { notify } from './notices'
import { useThreads } from './threads'

export type { BackendConfig, ConfigModel }

/** A config the backend accepted. */
export type CheckedConfig = Extract<ConfigCheck, { ok: true }>

export function readConfig(): Promise<ConfigCheck | undefined> {
  return run((e) => e.config.read, () => desktop.config.read())
}

/** Applies changes and restarts the backend. A restart stops commands that
 * are executing (ollupi marks them as possibly done), so with threads
 * running it asks first. Resolves to the config now in effect, or
 * undefined when nothing was applied. */
export async function applyConfig(changes: ConfigChange[]): Promise<CheckedConfig | undefined> {
  const running = useThreads.getState().list.filter((t) => isWorking(t.status)).length
  if (running && !confirm(`${running} thread${running === 1 ? ' is' : 's are'} running. Restarting the backend stops commands they are executing. Continue?`)) {
    return undefined
  }
  const result = await run((e) => e.config.save, () => desktop.config.apply(changes))
  if (!result) return undefined
  if (!result.ok) {
    notify(t().errors.configUnchanged(result.error))
    return undefined
  }
  return result
}
