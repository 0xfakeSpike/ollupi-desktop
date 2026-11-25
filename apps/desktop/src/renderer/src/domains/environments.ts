// Environments: where a conversation's commands run. Each is one sandbox of
// a provider the backend offers (this machine, a cloud's); a user's first is
// made with them, and a workspace is a folder of one. A conversation keeps
// the one it was started in, so the list is read once and kept live by
// environment/changed from then on, each change applied when it is newer
// than the list (seq). The providers come with the list and do not change.

import type { EnvironmentChangedNotification, EnvironmentRow, SandboxProviderRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { useNavigation } from './navigation'
import { dropEnvironmentWorkspaces } from './workspaces'

export const useEnvironments = create<{ list: EnvironmentRow[]; providers: SandboxProviderRow[] }>()(() => ({ list: [], providers: [] }))

/** The provider of this machine's sandboxes, as the backend names it. */
export const LOCAL_PROVIDER = 'local'

/** What the backend names the first environment of this machine. */
const LOCAL_NAME = 'This computer'

/** ollupi's order: the environment a person had first comes first, and a
 * conversation that names none runs in it. */
const order = (list: EnvironmentRow[]): EnvironmentRow[] =>
  list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

const upsert = (list: EnvironmentRow[], env: EnvironmentRow): EnvironmentRow[] =>
  order(list.some((e) => e.id === env.id) ? list.map((e) => (e.id === env.id ? env : e)) : [...list, env])

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ environmentId, environment, seq }: EnvironmentChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useEnvironments.setState((s) => (environment ? { list: upsert(s.list, environment) } : { list: s.list.filter((e) => e.id !== environmentId) }))
  if (!environment) dropEnvironmentWorkspaces(environmentId)
}

export const environmentsDomain: Domain = {
  bind: (client) => client.on('environment/changed', changed),
  sync: async (client) => {
    const { result, newer } = await client.snapshot('environment/list', {}, ['environment/changed'])
    seen = result.seq
    useEnvironments.setState({ list: order(result.data), providers: result.providers ?? [] })
    newer.forEach((e) => changed(e.params))
  },
  disconnect: () => {
    seen = 0
    useEnvironments.setState({ list: [], providers: [] })
  },
}

export function useEnvironment(id: string | undefined): EnvironmentRow | undefined {
  return useEnvironments((s) => (id ? s.list.find((e) => e.id === id) : undefined))
}

/** Where a conversation runs when it names none: the user's first
 * environment, made with them. */
export function defaultEnvironment(list: readonly EnvironmentRow[]): EnvironmentRow | undefined {
  return list[0]
}

/** Whether an environment is a sandbox of this machine. */
export const onThisMachine = (e: EnvironmentRow | undefined): boolean => e?.provider === LOCAL_PROVIDER

/** What to call an environment: its name, but the one the backend names
 * this machine by is said in the person's language. */
export function environmentName(e: EnvironmentRow): string {
  return onThisMachine(e) && e.name === LOCAL_NAME ? t().conversation.environment.here : e.name
}

/** What its provider calls an environment's sandboxes; this machine's are
 * said in the person's language. */
export function providerName(provider: string, providers: readonly SandboxProviderRow[]): string {
  if (provider === LOCAL_PROVIDER) return t().conversation.environment.here
  return providers.find((p) => p.id === provider)?.name ?? provider
}

/** The environment the next conversation starts in: the one chosen in the
 * composer while it is still there, or none, which is the user's first. */
export function chosenEnvironment(): string | undefined {
  const chosen = useNavigation.getState().environment
  return chosen && useEnvironments.getState().list.some((e) => e.id === chosen) ? chosen : undefined
}

/** Names another place conversations can run: a new sandbox of provider,
 * made when a conversation first runs in it. The list follows the change
 * through environment/changed. */
export function addEnvironment(name: string, provider: string): Promise<boolean> {
  return run((e) => e.environment.add, async () => {
    await gateway().call('environment/add', { name, provider })
    return true
  }).then(Boolean)
}

export function renameEnvironment(environmentId: string, name: string): Promise<boolean> {
  return run((e) => e.environment.rename, async () => {
    await gateway().call('environment/rename', { environmentId, name })
    return true
  }).then(Boolean)
}

/** Deletes an environment and its sandbox. ollupi refuses the user's first,
 * and any environment a conversation or a workspace is in: neither moves. */
export function deleteEnvironment(environmentId: string): Promise<boolean> {
  return run((e) => e.environment.delete, async () => {
    await gateway().call('environment/delete', { environmentId })
    return true
  }).then(Boolean)
}
