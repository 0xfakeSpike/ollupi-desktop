// Long-term memory is only shown on the memory screen, so it is fetched on
// demand and kept in that screen's local state rather than a global store.

import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { session } from '../session'
import { guard } from './guard'

/** Global memories have no workspace; a workspace scope can include them. */
export type MemoryScope = { workspaceId: string | undefined; includeGlobal: boolean }

export function fetchMemory(scope: MemoryScope): Promise<{ status: MemoryStatus; entries: MemoryRow[] } | undefined> {
  return guard('Could not load memory', async () => {
    const client = session.current()
    const params = scope.workspaceId ? { workspaceId: scope.workspaceId, includeGlobal: scope.includeGlobal } : {}
    const [status, list] = await Promise.all([client.call('memory/status', {}), client.call('memory/list', params)])
    return { status, entries: list.data }
  })
}

export function editMemory(id: string, text: string): Promise<MemoryRow | undefined> {
  return guard('Could not save the memory', async () => (await session.current().call('memory/update', { id, text })).memory)
}

export function forgetMemory(id: string): Promise<boolean> {
  return guard('Could not forget the memory', async () => {
    await session.current().call('memory/forget', { id })
    return true
  }).then(Boolean)
}
