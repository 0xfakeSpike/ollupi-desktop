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

/** A task of the hub's plan, read from its line: open ([ ]) in TODO.md, or
 * done or dropped ([x], the task struck through when dropped) in a month's
 * done file. */
export interface PlanItem {
  /** What is to be done, without its marks. */
  task: string
  state: 'open' | 'done' | 'dropped'
  /** The project it belongs to, as the hub wrote the workspace's name. */
  project: string | undefined
  /** The conversation working on it, from its #thread-<id> link. */
  thread: { id: string; title: string } | undefined
  /** What else the line says (a result, why it was dropped), and the
   * indented lines under it, in order. */
  note: string | undefined
}

/** The tasks of a plan file, in its order. Anything else in the file
 * (headings, prose) is not a task; rest says whether there is such text,
 * so a file written otherwise can still be shown as it is. */
export function parsePlan(text: string): { items: PlanItem[]; rest: boolean } {
  const items: PlanItem[] = []
  let rest = false
  let last: PlanItem | undefined
  for (const line of text.split('\n')) {
    const task = /^[-*+] \[( |x|X)\]\s+(.*)$/.exec(line.trimEnd())
    if (task) {
      last = planItem(task[1] !== ' ', task[2]!)
      items.push(last)
      continue
    }
    const trimmed = line.trim()
    if (!trimmed) continue
    // A line indented under a task is its note.
    if (last && /^\s+/.test(line)) {
      const note = trimmed.replace(/^[-*+]\s+/, '')
      last.note = last.note ? `${last.note}\n${note}` : note
      continue
    }
    last = undefined
    // A heading names the file; it is no content of its own.
    if (!/^#{1,6}\s/.test(trimmed)) rest = true
  }
  return { items, rest }
}

/** A note says what it is by its place: the label a model often puts
 * before it (result:, dropped:, 结果：) is left out. */
function withoutLabel(note: string): string {
  return note.replace(/^(result|outcome|dropped|why|reason|note|结果|原因|不做的原因|备注)\s*[:：]\s*/i, '')
}

function planItem(checked: boolean, body: string): PlanItem {
  const parts = body.split(/\s+·\s+/)
  const first = parts.shift()!.trim()
  const struck = /^~~(.+)~~$/.exec(first)
  let project: string | undefined
  let thread: PlanItem['thread']
  const notes: string[] = []
  for (const part of parts) {
    const link = /^\[([^\]]*)\]\(#thread-([^)\s]+)\)$/.exec(part.trim())
    if (link && !thread) thread = { id: link[2]!, title: link[1]! }
    // The project comes right after the task, before any link.
    else if (project === undefined && !thread && notes.length === 0 && !/[:：]/.test(part)) project = part.trim()
    else notes.push(withoutLabel(part.trim()))
  }
  return {
    task: struck ? struck[1]! : first,
    state: !checked ? 'open' : struck ? 'dropped' : 'done',
    project,
    thread,
    note: notes.length ? notes.join(' · ') : undefined,
  }
}
