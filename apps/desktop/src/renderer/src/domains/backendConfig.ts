// The backend's config.yaml, through the main process, which first checks
// the changed file with the backend itself. A change to the providers (the
// models the backend serves) reloads into the running backend; any other
// restarts it.

import { isWorking } from '@ollupi/core'
import { useEffect, useState } from 'react'
import type { ConfigChange, ConfigCheck } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { notify } from './notices'
import { refreshModels } from './models'
import { useThreads } from './threads'

/** A config the backend accepted. */
export type CheckedConfig = Extract<ConfigCheck, { ok: true }>

export function readConfig(): Promise<ConfigCheck | undefined> {
  return run((e) => e.config.read, () => desktop.config.read())
}

/** config.yaml as the backend checked it, read once for the screen that
 * shows it; set takes the config a change applied. */
export function useCheckedConfig(): { checked: CheckedConfig | undefined; error: string | undefined; set(c: CheckedConfig): void } {
  const [checked, set] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? set(r) : setError(r?.error)))
  }, [])
  return { checked, error, set }
}

/** A restart stops commands that are executing (ollupi marks them as
 * possibly done), so with threads running it asks first. */
export function confirmRestart(): boolean {
  const running = useThreads.getState().list.filter((t) => isWorking(t.status)).length
  return !running || confirm(t().common.restartRunning(running))
}

/** Applies changes and restarts the backend, asking first while threads
 * run, or, for a change the main process reloads (the providers), without
 * asking. Resolves to the config now in effect, or undefined when nothing
 * was applied. */
export async function applyConfig(changes: ConfigChange[], { reload = false } = {}): Promise<CheckedConfig | undefined> {
  if (!reload && !confirmRestart()) return undefined
  const result = await run((e) => e.config.save, () => desktop.config.apply(changes))
  if (!result) return undefined
  if (!result.ok) {
    notify(t().errors.configUnchanged(result.error))
    return undefined
  }
  return result
}

/** Saves an edit to the providers and reloads them into the running
 * backend; the model list is read again once it took them. */
export async function applyProviders(changes: ConfigChange[]): Promise<CheckedConfig | undefined> {
  const applied = await applyConfig(changes, { reload: true })
  if (applied) await refreshModels().catch(() => {})
  return applied
}
