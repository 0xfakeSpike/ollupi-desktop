import { beforeEach, describe, expect, it } from 'vitest'
import type { EnvironmentRow } from '@ollupi/protocol'
import { defaultEnvironment, environmentName, environmentsDomain, onThisMachine, providerName, useEnvironments } from './environments'

const env = (id: string, name: string, provider: string, createdAt: string): EnvironmentRow => ({
  id,
  name,
  provider,
  createdAt,
  updatedAt: createdAt,
})

/** A gateway as the domain uses it: environment/list's answer at a seq,
 * the environment/changed payloads a change arrives as, and those that
 * come while the list is on its way. */
function gateway(list: EnvironmentRow[], seq = 1, onTheWay: [string, EnvironmentRow | null, number][] = []) {
  const listeners = new Map<string, (params: never) => void>()
  const changed = (environmentId: string, environment: EnvironmentRow | null, at = seq + 1) =>
    listeners.get('environment/changed')?.({ environmentId, environment, seq: at } as never)
  return {
    client: {
      snapshot: async () => ({
        result: { data: list, seq, providers: [{ id: 'local', name: 'This computer' }, { id: 'cloud', name: 'A cloud sandbox' }] },
        newer: onTheWay.filter(([, , at]) => at > seq).map(([environmentId, environment, at]) => ({ method: 'environment/changed', params: { environmentId, environment, seq: at } })),
      }),
      on: (method: string, listener: (params: never) => void) => {
        listeners.set(method, listener)
        return () => void listeners.delete(method)
      },
    } as never,
    changed,
  }
}

describe('environments', () => {
  beforeEach(() => environmentsDomain.disconnect!())

  it("lists them in ollupi's order, the user's first first, with the sandboxes offered", async () => {
    const local = env('e1', 'This computer', 'local', '2026-01-01T00:00:00Z')
    const sandbox = env('e2', 'Build box', 'cloud', '2026-02-01T00:00:00Z')
    await environmentsDomain.sync!(gateway([sandbox, local]).client)
    const { list, providers } = useEnvironments.getState()
    expect(list.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(defaultEnvironment(list)?.id).toBe('e1')
    expect(providerName('cloud', providers)).toBe('A cloud sandbox')
    expect([onThisMachine(local), onThisMachine(sandbox)]).toEqual([true, false])
  })

  it('says this machine in the person’s language, and any other by its name', () => {
    expect(environmentName(env('e1', 'This computer', 'local', ''))).toBe('This computer')
    expect(environmentName(env('e3', 'Scratch', 'local', ''))).toBe('Scratch')
    expect(environmentName(env('e2', 'This computer', 'cloud', ''))).toBe('This computer')
  })

  it('adds and renames one as environment/changed says', async () => {
    const { client, changed } = gateway([])
    environmentsDomain.bind!(client)
    changed('e2', env('e2', 'Build box', 'cloud', '2026-02-01T00:00:00Z'), 2)
    changed('e2', env('e2', 'Build box 2', 'cloud', '2026-02-01T00:00:00Z'), 3)
    expect(useEnvironments.getState().list).toMatchObject([{ id: 'e2', name: 'Build box 2' }])
  })

  it('drops one that is gone, by a null environment', async () => {
    const { client, changed } = gateway([])
    environmentsDomain.bind!(client)
    changed('e2', env('e2', 'Build box', 'cloud', '2026-02-01T00:00:00Z'), 2)
    changed('e2', null, 3)
    expect(useEnvironments.getState().list).toEqual([])
  })

  it('keeps a change newer than the list, whichever comes first, and drops one the list has', async () => {
    const local = env('e1', 'This computer', 'local', '2026-01-01T00:00:00Z')
    const box = env('e2', 'Build box', 'cloud', '2026-02-01T00:00:00Z')
    const renamed = { ...box, name: 'Build box 2' }
    const { client, changed } = gateway([local, box], 5, [['e2', renamed, 6], ['e1', null, 4]])
    environmentsDomain.bind!(client)
    await environmentsDomain.sync!(client)
    expect(useEnvironments.getState().list.map((e) => e.name)).toEqual(['This computer', 'Build box 2'])
    changed('e2', box, 5)
    changed('e1', null, 3)
    expect(useEnvironments.getState().list.map((e) => e.name)).toEqual(['This computer', 'Build box 2'])
  })
})
