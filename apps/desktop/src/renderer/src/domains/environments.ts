// Environments: where a conversation's commands run. One is this machine,
// which every user has; the rest are cloud sandboxes they add. A conversation
// keeps the one it was started in, so the list is read once and kept live by
// environment/changed from then on, each change applied when it is newer
// than the list (seq).

import type { EnvironmentChangedNotification, EnvironmentRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { useNavigation } from './navigation'

export const useEnvironments = create<{ list: EnvironmentRow[] }>()(() => ({ list: [] }))

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
}

export const environmentsDomain: Domain = {
  bind: (client) => client.on('environment/changed', changed),
  sync: async (client) => {
    const { result, newer } = await client.snapshot('environment/list', {}, ['environment/changed'])
    seen = result.seq
    useEnvironments.setState({ list: order(result.data) })
    newer.forEach((e) => changed(e.params))
  },
  disconnect: () => {
    seen = 0
    useEnvironments.setState({ list: [] })
  },
}

export function useEnvironment(id: string | undefined): EnvironmentRow | undefined {
  return useEnvironments((s) => (id ? s.list.find((e) => e.id === id) : undefined))
}

/** Where a conversation runs when it names none: this machine, the one
 * environment every user has. */
export function defaultEnvironment(list: readonly EnvironmentRow[]): EnvironmentRow | undefined {
  return list.find((e) => e.kind === 'local') ?? list[0]
}

/** The environment the next conversation starts in: the one chosen in the
 * composer while it is still there, or none, which is this machine. */
export function chosenEnvironment(): string | undefined {
  const chosen = useNavigation.getState().environment
  return chosen && useEnvironments.getState().list.some((e) => e.id === chosen) ? chosen : undefined
}

/** Names another place conversations can run: a cloud sandbox. The list
 * follows the change through environment/changed. */
export function addEnvironment(name: string): Promise<boolean> {
  return run((e) => e.environment.add, async () => {
    await gateway().call('environment/add', { name })
    return true
  }).then(Boolean)
}

export function renameEnvironment(environmentId: string, name: string): Promise<boolean> {
  return run((e) => e.environment.rename, async () => {
    await gateway().call('environment/rename', { environmentId, name })
    return true
  }).then(Boolean)
}

/** Removes a cloud sandbox from the list. ollupi refuses this machine, and
 * any environment a conversation runs in: a conversation does not move. */
export function deleteEnvironment(environmentId: string): Promise<boolean> {
  return run((e) => e.environment.delete, async () => {
    await gateway().call('environment/delete', { environmentId })
    return true
  }).then(Boolean)
}
