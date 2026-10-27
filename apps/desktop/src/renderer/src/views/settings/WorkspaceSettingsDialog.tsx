import type { WorkspaceRow } from '@ollupi/protocol'
import { Dialog, Field, Input } from '@ollupi/ui'
import { useState } from 'react'
import { renameWorkspace, updateWorkspacePermissions } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { PermissionEditor } from './PermissionEditor'

/** A workspace's name and permissions. */
export function WorkspaceSettingsDialog({ workspace, onClose }: { workspace: WorkspaceRow; onClose(): void }) {
  const m = useT()
  const [name, setName] = useState(workspace.name)
  const rename = () => {
    const next = name.trim()
    if (next && next !== workspace.name) void renameWorkspace(workspace.id, next)
  }
  return (
    <Dialog title={m.settings.permissions.workspace.title} closeLabel={m.common.close} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label={m.settings.permissions.workspace.name} hint={<span className="selectable font-mono">{workspace.rootPath}</span>}>
          <Input value={name} className="max-w-60" onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} />
        </Field>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-fg-muted">{m.settings.permissions.workspace.permissions}</h3>
          <p className="text-xs text-fg-muted">{m.settings.permissions.workspace.intro}</p>
          <PermissionEditor value={workspace.settings} inheritFrom={m.settings.permissions.fromAgent} onSave={(s) => updateWorkspacePermissions(workspace.id, s)} />
        </div>
      </div>
    </Dialog>
  )
}
