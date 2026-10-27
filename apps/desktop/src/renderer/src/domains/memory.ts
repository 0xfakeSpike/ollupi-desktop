// Long-term memory. Extraction runs beside the agent and sends no events,
// so the memory screen reads on demand and keeps its result locally.

import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

/** Memories by scope: '' is global, any other key a workspace id. */
export type MemoryScopes = Map<string, MemoryRow[]>

/** memory/status counts active memories in every scope, while memory/list
 * reads one, so each scope is read on its own: the global one and every
 * workspace without the global ones, archived workspaces included, since
 * their memories stay. */
export function readMemory(workspaceIds: string[]): Promise<{ status: MemoryStatus; scopes: MemoryScopes } | undefined> {
  return run('Could not load memory', async () => {
    const client = gateway()
    const [status, global, ...lists] = await Promise.all([
      client.call('memory/status', {}),
      client.call('memory/list', {}),
      ...workspaceIds.map((workspaceId) => client.call('memory/list', { workspaceId, includeGlobal: false })),
    ])
    const scopes: MemoryScopes = new Map([['', global.data]])
    workspaceIds.forEach((id, i) => scopes.set(id, lists[i]!.data))
    return { status, scopes }
  })
}

export function editMemory(id: string, text: string): Promise<MemoryRow | undefined> {
  return run('Could not save the memory', async () => (await gateway().call('memory/update', { id, text })).memory)
}

export function forgetMemory(id: string): Promise<boolean> {
  return run('Could not forget the memory', async () => {
    await gateway().call('memory/forget', { id })
    return true
  }).then(Boolean)
}
