// Workspaces: project folders threads run in. ollupi sends every change as
// workspace/changed (an "always allow" answer included), before it answers
// the call that made it, so the calls below leave the list to it.

import { compareWorkspaces, upsertWorkspace } from '@ollupi/core'
import type { PermissionSettings, WorkspaceRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'
import { go } from './navigation'

export const useWorkspaces = create<{ list: WorkspaceRow[] }>()(() => ({ list: [] }))

const apply = (ws: WorkspaceRow) => useWorkspaces.setState((s) => ({ list: upsertWorkspace(s.list, ws) }))

export const workspacesDomain: Domain = {
  bind: (client) => client.on('workspace/changed', ({ workspace }) => apply(workspace)),
  sync: async (client) => {
    const { data } = await client.call('workspace/list', {})
    useWorkspaces.setState({ list: data.slice().sort(compareWorkspaces) })
  },
}

export function useWorkspace(id: string | undefined): WorkspaceRow | undefined {
  return useWorkspaces((s) => (id ? s.list.find((w) => w.id === id) : undefined))
}

export function activeWorkspaces(list: readonly WorkspaceRow[]): WorkspaceRow[] {
  return list.filter((w) => !w.archivedAt)
}

/** Picks a folder, registers it, and opens a draft in it. */
export function addWorkspace(): Promise<void | undefined> {
  return run((e) => e.workspace.add, async () => {
    const path = await desktop.pickDirectory()
    if (!path) return
    const { workspace } = await gateway().call('workspace/add', { path })
    go({ kind: 'draft', workspaceId: workspace.id })
  })
}

export function renameWorkspace(workspaceId: string, name: string): Promise<void | undefined> {
  return run((e) => e.workspace.rename, async () => {
    await gateway().call('workspace/rename', { workspaceId, name })
  })
}

/** Moves the workspace's folder to path, a folder that is there and empty.
 * The workspace keeps its id, so its threads, memories and tasks stay its
 * own; the folder's files move with it. ollupi refuses while a turn runs in
 * the workspace, since that turn names paths in the old place. */
export function moveWorkspace(workspaceId: string, path: string): Promise<void | undefined> {
  return run((e) => e.workspace.move, async () => {
    await gateway().call('workspace/move', { workspaceId, path })
  })
}

export function setArchived(workspaceId: string, archived: boolean): Promise<void | undefined> {
  return run((e) => (archived ? e.workspace.archive : e.workspace.restore), async () => {
    await gateway().call('workspace/archive', { workspaceId, archived })
  })
}

/** The Super Agent is the user's hub: a workspace of its own folder, in the
 * backend's home, whose conversations hand work out to the projects. The
 * first time, the folder is made, added and made the hub; adding a folder
 * that is a workspace already gives that one back, restored if archived. A
 * draft opens in it either way. */
export function startSuperAgent(name: string): Promise<void | undefined> {
  return run((e) => e.workspace.superAgent, async () => {
    const { current } = await gateway().call('user/list', {})
    const path = await desktop.superAgentFolder(current)
    const { workspace } = await gateway().call('workspace/add', { path, name })
    if (workspace.kind !== 'hub') await gateway().call('workspace/setKind', { workspaceId: workspace.id, kind: 'hub' })
    go({ kind: 'draft', workspaceId: workspace.id })
  })
}

/** What every conversation in the workspace is told, after its role's own
 * rules; empty clears it. */
export function updateWorkspaceInstructions(workspaceId: string, instructions: string): Promise<boolean> {
  return run((e) => e.workspace.instructions, async () => {
    await gateway().call('workspace/updateInstructions', { workspaceId, instructions })
    return true
  }).then(Boolean)
}

export function updateWorkspacePermissions(workspaceId: string, settings: PermissionSettings): Promise<boolean> {
  return run((e) => e.workspace.permissions, async () => {
    await gateway().call('workspace/updatePermissions', { workspaceId, ...settings })
    return true
  }).then(Boolean)
}
