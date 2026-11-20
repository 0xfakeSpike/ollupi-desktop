// The Super Agent's plan, as the files it keeps in its own folder: TODO.md
// for what is not finished, and a file per month in done/ for what was done
// or dropped (core's HUB_PLAN_FILE, HUB_DONE_FOLDER). The app only reads
// them: again when a write to one of them ends in any conversation, when
// the hub changes, and when the window comes back to the front, as the user
// may have edited them.

import { callOf, doneMonths, HUB_DONE_FOLDER, HUB_PLAN_FILE, hubOf, isPlanPath } from '@ollupi/core'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'
import { desktop } from '../platform/desktop'
import { readTextQuietly } from './files'
import { useWorkspaces } from './workspaces'

interface Plan {
  /** The hub's folder the plan was read from. */
  root: string | undefined
  /** TODO.md as written; undefined while there is none. */
  text: string | undefined
  /** The months done/ has a file for, newest first. */
  months: string[]
  /** Bumped on each read, so what shows a file reads it again. */
  version: number
}

export const usePlan = create<Plan>()(() => ({ root: undefined, text: undefined, months: [], version: 0 }))

let reading = 0

/** Reads the hub's plan files again; the last read started wins. */
export async function refreshPlan(): Promise<void> {
  const root = hubOf(useWorkspaces.getState().list)?.rootPath
  const read = ++reading
  if (!root) return void usePlan.setState({ root: undefined, text: undefined, months: [] })
  const [text, names] = await Promise.all([readTextQuietly(root, HUB_PLAN_FILE), listQuietly(root, HUB_DONE_FOLDER)])
  if (read !== reading) return
  usePlan.setState((s) => ({ root, text, months: doneMonths(names), version: s.version + 1 }))
}

/** A month's done file of the hub, as written; undefined when it cannot be read. */
export function readDoneMonth(root: string, month: string): Promise<string | undefined> {
  return readTextQuietly(root, `${HUB_DONE_FOLDER}/${month}.md`)
}

async function listQuietly(root: string, folder: string): Promise<string[]> {
  try {
    return (await desktop.files.list(root, folder)).filter((e) => e.kind === 'file').map((e) => e.name)
  } catch {
    return []
  }
}

export const planDomain: Domain = {
  bind: (client) => {
    const off = client.on('item/changed', ({ item }) => {
      if (item.type !== 'toolCall' || item.status !== 'completed') return
      const call = callOf(item)
      if (call.kind === 'file' && isPlanPath(call.change.path)) void refreshPlan()
    })
    const unsubscribe = useWorkspaces.subscribe((s, prev) => {
      if (hubOf(s.list)?.rootPath !== hubOf(prev.list)?.rootPath) void refreshPlan()
    })
    const focus = () => void refreshPlan()
    window.addEventListener('focus', focus)
    return () => {
      off()
      unsubscribe()
      window.removeEventListener('focus', focus)
    }
  },
  sync: () => refreshPlan(),
}
