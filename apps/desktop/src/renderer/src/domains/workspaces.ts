// Workspaces: the folders threads run in, each of one environment's
// machine; every environment has a scratch one, its own folder, where a
// thread started in no project goes. ollupi sends every change as
// workspace/changed (an "always allow" answer included), before it answers
// the call that made it, so the calls below leave the list to it.

import { compareWorkspaces, upsertWorkspace } from '@ollupi/core'
import type { EnvironmentFoldersResult, PermissionSettings, WorkspaceChangedNotification, WorkspaceRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { go } from './navigation'

export const useWorkspaces = create<{ list: WorkspaceRow[] }>()(() => ({ list: [] }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ workspace, seq }: WorkspaceChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useWorkspaces.setState((s) => ({ list: upsertWorkspace(s.list, workspace) }))
}

export const workspacesDomain: Domain = {
  bind: (client) => client.on('workspace/changed', changed),
  sync: async (client) => {
    const { result, newer } = await client.snapshot('workspace/list', {}, ['workspace/changed'])
    seen = result.seq
    useWorkspaces.setState({ list: result.data.slice().sort(compareWorkspaces) })
    newer.forEach((e) => changed(e.params))
  },
  disconnect: () => {
    seen = 0
    useWorkspaces.setState({ list: [] })
  },
}

export function useWorkspace(id: string | undefined): WorkspaceRow | undefined {
  return useWorkspaces((s) => (id ? s.list.find((w) => w.id === id) : undefined))
}

export function activeWorkspaces(list: readonly WorkspaceRow[]): WorkspaceRow[] {
  return list.filter((w) => !w.archivedAt)
}

/** Whether the dialog that adds a workspace is open. */
export const useAddingWorkspace = create<{ open: boolean }>()(() => ({ open: false }))

/** Opens the dialog that picks a folder of an environment's machine to add
 * as a workspace. */
export function addWorkspace(): void {
  useAddingWorkspace.setState({ open: true })
}

/** Registers a folder of an environment's machine as a workspace and opens a
 * draft in it. */
export function addWorkspaceAt(environmentId: string | undefined, path: string): Promise<boolean> {
  return run((e) => e.workspace.add, async () => {
    const { workspace } = await gateway().call('workspace/add', { path, environmentId })
    useAddingWorkspace.setState({ open: false })
    go({ kind: 'draft', workspaceId: workspace.id })
    return true
  }).then(Boolean)
}

export type FolderList = EnvironmentFoldersResult

/** A folder of an environment's machine and the folders in it: path, or the
 * environment's own folder when undefined. */
export function listFolders(environmentId: string | undefined, path: string | undefined): Promise<FolderList | undefined> {
  return run((e) => e.workspace.browse, () => gateway().call('environment/listFolders', { environmentId, path }))
}

/** Makes a folder named name in parent, answering its path. */
export function makeFolder(environmentId: string | undefined, parent: string, name: string): Promise<string | undefined> {
  return run((e) => e.workspace.makeFolder, async () => (await gateway().call('environment/makeFolder', { environmentId, parent, name })).path)
}

/** The workspaces of one environment are its folders; a deleted one's
 * scratch workspace, the only one it may have had, goes with it. */
export function dropEnvironmentWorkspaces(environmentId: string): void {
  useWorkspaces.setState((s) => ({ list: s.list.filter((w) => w.environmentId !== environmentId) }))
}

/** The scratch workspace of an environment, where a thread started in no
 * project goes: the user's first environment's when none is named. */
export function scratchOf(list: readonly WorkspaceRow[], environmentId: string | undefined, environments: readonly { id: string }[]): WorkspaceRow | undefined {
  const env = environmentId ?? environments[0]?.id
  return list.find((w) => w.kind === 'scratch' && w.environmentId === env)
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

/** The Super Agent is the user's hub: a workspace whose conversations hand
 * work out to the projects, in the folder their first environment keeps for
 * it. ollupi makes it the first time and gives it back after, restored if
 * archived; a draft opens in it either way. */
export function startSuperAgent(): Promise<void | undefined> {
  return run((e) => e.workspace.superAgent, async () => {
    const { workspace } = await gateway().call('workspace/startHub', {})
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
