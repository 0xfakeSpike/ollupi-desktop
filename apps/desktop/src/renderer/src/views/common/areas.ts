// A workspace's area colour (DESIGN.md §0, stone and moss): the flat field
// it is recognised by in the sidebar and in the conversation's header. The
// workspaces take the six fields in the order they were made, each the one
// fewest of the earlier ones have, so up to six never share one, whatever
// order the sidebar shows them in; a seventh shares with the earliest. A
// workspace keeps its field as others are added and archived; only deleting
// one can move the fields of those made after it.

import type { WorkspaceRow } from '@ollupi/protocol'

export const FIELDS = ['bg-area-1', 'bg-area-2', 'bg-area-3', 'bg-area-4', 'bg-area-5', 'bg-area-6'] as const
export type AreaField = (typeof FIELDS)[number]

/** The field a workspace leans to, from its id: the one it takes when
 * several are equally free, and before the list is read. */
export function leaning(workspaceId: string): number {
  let hash = 0
  for (let i = 0; i < workspaceId.length; i++) hash = (hash * 31 + workspaceId.charCodeAt(i)) >>> 0
  return hash % FIELDS.length
}

/** Each workspace's field. The Super Agent's hub sits on the paper, so it
 * takes none. */
export function areaFields(workspaces: readonly Pick<WorkspaceRow, 'id' | 'kind' | 'createdAt'>[]): Map<string, AreaField> {
  const made = workspaces.filter((w) => w.kind !== 'hub').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const used = FIELDS.map(() => 0)
  const out = new Map<string, AreaField>()
  for (const w of made) {
    const fewest = Math.min(...used)
    const from = leaning(w.id)
    let i = from
    while (used[i] !== fewest) i = (i + 1) % FIELDS.length
    used[i]!++
    out.set(w.id, FIELDS[i]!)
  }
  return out
}
