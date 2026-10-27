// Long-term memory. Extraction runs beside the agent and sends no events,
// so the memory screen reads on demand and keeps its result locally.

import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

/** Memories by scope: '' is global, any other key a workspace id. */
export type MemoryScopes = Map<string, MemoryRow[]>

/** memory/status counts active memories in every scope, but memory/list
 * reads one (a workspace's, optionally with the global ones), so each scope
 * is read on its own: the global one and every workspace, archived ones
 * included, since their memories stay. */
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

/** Memories of several scopes in memory/list's order: updated_at DESC, id. */
export function mergeScopes(scopes: MemoryScopes, keys: string[]): MemoryRow[] {
  return keys
    .flatMap((k) => scopes.get(k) ?? [])
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
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
