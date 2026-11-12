// A workspace's area colour (DESIGN.md §0, stone and moss): the flat field
// it is recognised by in the sidebar and in the conversation's header. It
// follows the workspace's id, so it stays the same however the sidebar
// orders workspaces; six fields, so neighbours rarely share one.

const FIELDS = ['bg-area-1', 'bg-area-2', 'bg-area-3', 'bg-area-4', 'bg-area-5', 'bg-area-6'] as const

export function areaClass(workspaceId: string): (typeof FIELDS)[number] {
  let hash = 0
  for (let i = 0; i < workspaceId.length; i++) hash = (hash * 31 + workspaceId.charCodeAt(i)) >>> 0
  return FIELDS[hash % FIELDS.length]!
}
