import { beforeEach, describe, expect, it } from 'vitest'
import type { EnvironmentRow } from '@ollupi/protocol'
import { defaultEnvironment, environmentsDomain, useEnvironments } from './environments'

const env = (id: string, name: string, kind: 'local' | 'machine', createdAt: string): EnvironmentRow => ({
  id,
  name,
  kind,
  createdAt,
  updatedAt: createdAt,
})

/** A gateway as the domain uses it: environment/list's answer, and the
 * environment/changed payloads a change arrives as. */
function gateway(list: EnvironmentRow[]) {
  const listeners = new Map<string, (params: never) => void>()
  return {
    client: {
      call: async () => ({ data: list }),
      on: (method: string, listener: (params: never) => void) => {
        listeners.set(method, listener)
        return () => void listeners.delete(method)
      },
    } as never,
    changed: (environmentId: string, environment: EnvironmentRow | null) =>
      listeners.get('environment/changed')?.({ environmentId, environment } as never),
  }
}

describe('environments', () => {
  beforeEach(() => useEnvironments.setState({ list: [] }))

  it("lists them in ollupi's order, this machine first", async () => {
    const local = env('e1', 'This computer', 'local', '2026-01-01T00:00:00Z')
    const sandbox = env('e2', 'Build box', 'machine', '2026-02-01T00:00:00Z')
    await environmentsDomain.sync!(gateway([sandbox, local]).client)
    expect(useEnvironments.getState().list.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(defaultEnvironment(useEnvironments.getState().list)?.id).toBe('e1')
  })

  it('adds and renames one as environment/changed says', async () => {
    const { client, changed } = gateway([])
    environmentsDomain.bind!(client)
    changed('e2', env('e2', 'Build box', 'machine', '2026-02-01T00:00:00Z'))
    changed('e2', env('e2', 'Build box 2', 'machine', '2026-02-01T00:00:00Z'))
    expect(useEnvironments.getState().list).toMatchObject([{ id: 'e2', name: 'Build box 2' }])
  })

  it('drops one that is gone, by a null environment', async () => {
    const { client, changed } = gateway([])
    environmentsDomain.bind!(client)
    changed('e2', env('e2', 'Build box', 'machine', '2026-02-01T00:00:00Z'))
    changed('e2', null)
    expect(useEnvironments.getState().list).toEqual([])
  })
})
