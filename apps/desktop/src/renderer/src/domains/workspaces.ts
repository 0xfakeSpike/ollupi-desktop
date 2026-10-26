// Workspaces: project folders threads run in. The gateway answers each
// change with the row and also sends workspace/changed; both carry the
// stored row, so applying either is the same.

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
  return run('Could not add the workspace', async () => {
    const path = await desktop.pickDirectory()
    if (!path) return
    const { workspace } = await gateway().call('workspace/add', { path })
    apply(workspace)
    go({ kind: 'draft', workspaceId: workspace.id })
  })
}

export function renameWorkspace(workspaceId: string, name: string): Promise<void | undefined> {
  return run('Could not rename the workspace', async () => {
    apply((await gateway().call('workspace/rename', { workspaceId, name })).workspace)
  })
}

export function setArchived(workspaceId: string, archived: boolean): Promise<void | undefined> {
  return run(archived ? 'Could not archive the workspace' : 'Could not restore the workspace', async () => {
    apply((await gateway().call('workspace/archive', { workspaceId, archived })).workspace)
  })
}

export function updateWorkspacePermissions(workspaceId: string, settings: PermissionSettings): Promise<boolean> {
  return run('Could not save the workspace permissions', async () => {
    apply((await gateway().call('workspace/updatePermissions', { workspaceId, ...settings })).workspace)
    return true
  }).then(Boolean)
}
