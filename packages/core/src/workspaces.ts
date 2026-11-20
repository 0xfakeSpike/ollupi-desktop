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

/** Where the hub (the app's Super Agent) keeps the user's plan, as
 * ollupi's hub rules say (agent.PlanFile, agent.DoneFolder, agent.PlanItem):
 * HUB_PLAN_FILE at the root of its own folder holds the tasks not finished
 * yet, one line each; a task done or dropped moves to the month's file in
 * HUB_DONE_FOLDER (done/2026-11.md). It writes them with its file tools;
 * ollupi keeps no plan of its own, and the app only reads these files. */
export const HUB_PLAN_FILE = 'TODO.md'
export const HUB_DONE_FOLDER = 'done'

/** Whether a path in the hub's folder is one of its plan files. */
export function isPlanPath(path: string): boolean {
  const p = path.replace(/^\.\//, '')
  return p === HUB_PLAN_FILE || p.endsWith(`/${HUB_PLAN_FILE}`) || p.startsWith(`${HUB_DONE_FOLDER}/`) || p.includes(`/${HUB_DONE_FOLDER}/`)
}

/** The tasks the plan has not finished: its lines still open ([ ]). */
export function openPlanItems(text: string): number {
  return text.split('\n').filter((line) => /^\s*[-*+] \[ \]\s/.test(line)).length
}

/** The months the hub has a done file for, newest first: done/2026-11.md
 * is 2026-11. Other names are not its. */
export function doneMonths(names: readonly string[]): string[] {
  return names
    .map((n) => /^(\d{4}-\d{2})\.md$/.exec(n)?.[1])
    .filter((m): m is string => !!m)
    .sort()
    .reverse()
}

/** The conversation a plan line links to: #thread-<conversation id>. */
export function planThreadLink(href: string | undefined): string | undefined {
  return href?.startsWith('#thread-') ? href.slice('#thread-'.length) || undefined : undefined
}
