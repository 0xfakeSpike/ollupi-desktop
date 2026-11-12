// The backend's config.yaml, through the main process. ollupi reads it only
// at start, so applying a change restarts the backend; the main process
// first checks the changed file with the backend itself.

import { isWorking } from '@ollupi/core'
import type { ApprovalPolicy } from '@ollupi/protocol'
import { create } from 'zustand'
import type { ConfigChange, ConfigCheck } from '../../../shared/ipc'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { notify } from './notices'
import { useThreads } from './threads'

/** A config the backend accepted. */
export type CheckedConfig = Extract<ConfigCheck, { ok: true }>

export function readConfig(): Promise<ConfigCheck | undefined> {
  return run((e) => e.config.read, () => desktop.config.read())
}

/** A restart stops commands that are executing (ollupi marks them as
 * possibly done), so with threads running it asks first. */
export function confirmRestart(): boolean {
  const running = useThreads.getState().list.filter((t) => isWorking(t.status)).length
  return !running || confirm(t().common.restartRunning(running))
}

/** Applies changes and restarts the backend, asking first while threads
 * run. Resolves to the config now in effect, or
 * undefined when nothing was applied. */
export async function applyConfig(changes: ConfigChange[]): Promise<CheckedConfig | undefined> {
  if (!confirmRestart()) return undefined
  const result = await run((e) => e.config.save, () => desktop.config.apply(changes))
  if (!result) return undefined
  if (!result.ok) {
    notify(t().errors.configUnchanged(result.error))
    return undefined
  }
  return result
}

/** The agent's approval policy in config.yaml (permissions.approval), which
 * a thread inherits when neither it nor its workspace sets one. */
export const useAgentPolicy = create<{ policy: ApprovalPolicy | undefined }>()(() => ({ policy: undefined }))

/** Read on every connection: a change to config.yaml restarts the backend,
 * so the next connection reads the new one. Unreadable leaves it unknown;
 * the settings screens say why. */
export const agentPolicyDomain: Domain = {
  sync: async () => {
    const r = await desktop.config.read().catch(() => undefined)
    useAgentPolicy.setState({ policy: r?.ok ? ((r.config.permissions.approval || undefined) as ApprovalPolicy | undefined) : undefined })
  },
}
