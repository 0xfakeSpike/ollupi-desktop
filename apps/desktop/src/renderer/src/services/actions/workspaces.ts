import type { PermissionSettings } from '@ollupi/protocol'
import { useCatalog } from '../../stores/catalog'
import { useNavigation } from '../../stores/navigation'
import { desktop } from '../desktop'
import { session } from '../session'
import { guard } from './guard'

/** Picks a folder and registers it as a workspace, then opens a draft in it. */
export function addWorkspace(): Promise<void | undefined> {
  return guard('Could not add the workspace', async () => {
    const path = await desktop.pickDirectory()
    if (!path) return
    const { workspace } = await session.current().call('workspace/add', { path })
    useCatalog.getState().upsertWorkspace(workspace)
    useNavigation.getState().go({ kind: 'draft', workspaceId: workspace.id })
  })
}

export function renameWorkspace(workspaceId: string, name: string): Promise<void | undefined> {
  return guard('Could not rename the workspace', async () => {
    const { workspace } = await session.current().call('workspace/rename', { workspaceId, name })
    useCatalog.getState().upsertWorkspace(workspace)
  })
}

export function archiveWorkspace(workspaceId: string, archived: boolean): Promise<void | undefined> {
  return guard('Could not archive the workspace', async () => {
    const { workspace } = await session.current().call('workspace/archive', { workspaceId, archived })
    useCatalog.getState().upsertWorkspace(workspace)
  })
}

export function updateWorkspacePermissions(workspaceId: string, settings: PermissionSettings): Promise<boolean> {
  return guard('Could not update workspace permissions', async () => {
    const { workspace } = await session.current().call('workspace/updatePermissions', { workspaceId, ...settings })
    useCatalog.getState().upsertWorkspace(workspace)
    return true
  }).then(Boolean)
}
