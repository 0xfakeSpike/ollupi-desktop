// Workspaces in workspace/list order (repo.Workspaces): updated_at newest
// first, then id. Renaming, archiving or changing permissions updates
// updated_at, so the row moves.

import type { WorkspaceRow } from '@ollupi/protocol'

export function compareWorkspaces(a: WorkspaceRow, b: WorkspaceRow): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
}

export function upsertWorkspace(list: readonly WorkspaceRow[], ws: WorkspaceRow): WorkspaceRow[] {
  return [...list.filter((w) => w.id !== ws.id), ws].sort(compareWorkspaces)
}

/** Where the hub (the app's Super Agent) keeps the user's plan: a Markdown
 * file at the root of its own folder, which it writes with its file tools
 * as ollupi's hub rules say (agent.PlanFile). ollupi keeps no plan of its
 * own; the app only reads this file. */
export const HUB_PLAN_FILE = 'TODO.md'
