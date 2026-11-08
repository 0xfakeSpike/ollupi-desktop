// Environments: where a conversation's commands run. One is this machine,
// which every user has; the rest are cloud sandboxes they add. A conversation
// keeps the one it was started in, so the list is read once and kept live by
// environment/changed from then on.

import type { EnvironmentRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'

export const useEnvironments = create<{ list: EnvironmentRow[] }>()(() => ({ list: [] }))

/** ollupi's order: the environment a person had first comes first, and a
 * conversation that names none runs in it. */
const order = (list: EnvironmentRow[]): EnvironmentRow[] =>
  list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

const upsert = (list: EnvironmentRow[], env: EnvironmentRow): EnvironmentRow[] =>
  order(list.some((e) => e.id === env.id) ? list.map((e) => (e.id === env.id ? env : e)) : [...list, env])

export const environmentsDomain: Domain = {
  bind: (client) =>
    client.on('environment/changed', ({ environmentId, environment }) =>
      useEnvironments.setState((s) =>
        environment ? { list: upsert(s.list, environment) } : { list: s.list.filter((e) => e.id !== environmentId) },
      ),
    ),
  sync: async (client) => {
    const { data } = await client.call('environment/list', {})
    useEnvironments.setState({ list: order(data) })
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
