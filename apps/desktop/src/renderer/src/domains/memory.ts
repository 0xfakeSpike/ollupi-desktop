// Long-term memory. Extraction runs beside the agent and sends no events,
// so the memory screen reads on demand and keeps its result locally.

import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

/** Where a memory applies: to every conversation (global), to those
 * outside any workspace (general), or to one workspace's. */
export type MemoryPlace = { scope: 'global' } | { scope: 'general' } | { scope: 'workspace'; workspaceId: string }

/** A place's key in MemoryScopes: the scope, or the workspace id. */
export const placeKey = (p: MemoryPlace): string => (p.scope === 'workspace' ? p.workspaceId : p.scope)

export const placeOf = (row: MemoryRow): MemoryPlace =>
  row.scope === 'workspace' ? { scope: 'workspace', workspaceId: row.workspaceId! } : { scope: row.scope }

/** Memories by placeKey. */
export type MemoryScopes = Map<string, MemoryRow[]>

/** memory/status counts active memories in every scope, while memory/list
 * reads one, so each is read on its own: global, general and every
 * workspace, archived ones included, since their memories stay. */
export function readMemory(workspaceIds: string[]): Promise<{ status: MemoryStatus; scopes: MemoryScopes } | undefined> {
  return run('Could not load memory', async () => {
    const client = gateway()
    const places: MemoryPlace[] = [{ scope: 'global' }, { scope: 'general' }, ...workspaceIds.map((workspaceId) => ({ scope: 'workspace' as const, workspaceId }))]
    const [status, ...lists] = await Promise.all([client.call('memory/status', {}), ...places.map((p) => client.call('memory/list', p))])
    return { status, scopes: new Map(places.map((p, i) => [placeKey(p), lists[i]!.data])) }
  })
}

export function editMemory(id: string, text: string): Promise<MemoryRow | undefined> {
  return run('Could not save the memory', async () => (await gateway().call('memory/update', { id, text })).memory)
}

/** Puts a memory in another place, when extraction chose the wrong one. */
export function moveMemory(id: string, to: MemoryPlace): Promise<MemoryRow | undefined> {
  return run('Could not move the memory', async () => (await gateway().call('memory/move', { id, ...to })).memory)
}

export function forgetMemory(id: string): Promise<boolean> {
  return run('Could not forget the memory', async () => {
    await gateway().call('memory/forget', { id })
    return true
  }).then(Boolean)
}
