// Long-term memory. Extraction runs beside the agent and sends no events,
// so the memory screen reads on demand and keeps its result locally.

import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

/** repo.Memories: a workspace's memories, optionally with the global ones;
 * without a workspace, only the global ones. */
export interface MemoryScope {
  workspaceId: string | undefined
  includeGlobal: boolean
}

export function readMemory(scope: MemoryScope): Promise<{ status: MemoryStatus; entries: MemoryRow[] } | undefined> {
  return run('Could not load memory', async () => {
    const client = gateway()
    const [status, list] = await Promise.all([
      client.call('memory/status', {}),
      client.call('memory/list', scope.workspaceId ? { workspaceId: scope.workspaceId, includeGlobal: scope.includeGlobal } : {}),
    ])
    return { status, entries: list.data }
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
