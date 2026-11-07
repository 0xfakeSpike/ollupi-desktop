import type { WorkspaceRow } from '@ollupi/protocol'
import { Button, Dialog, Field, Input } from '@ollupi/ui'
import { useState } from 'react'
import { moveWorkspace, renameWorkspace, updateWorkspacePermissions } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { PermissionEditor } from './PermissionEditor'

/** A workspace's name, folder and permissions. */
export function WorkspaceSettingsDialog({ workspace, onClose }: { workspace: WorkspaceRow; onClose(): void }) {
  const m = useT()
  const t = m.settings.permissions.workspace
  const [name, setName] = useState(workspace.name)
  const rename = () => {
    const next = name.trim()
    if (next && next !== workspace.name) void renameWorkspace(workspace.id, next)
  }
  // The folder moves to the one picked, which has to be empty; the workspace
  // keeps its id, so its conversations, memories and tasks stay its own.
  const move = async () => {
    const path = await desktop.pickDirectory()
    if (!path) return
    if (!confirm(t.moveConfirm(path))) return
    await moveWorkspace(workspace.id, path)
  }
  return (
    <Dialog title={t.title} closeLabel={m.common.close} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label={t.name}>
          <Input value={name} className="max-w-60" onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-ui font-medium text-fg">{t.folder}</span>
          <div className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1 selectable font-mono text-small break-all text-fg-muted">{workspace.rootPath}</span>
            <Button size="sm" onClick={() => void move()}>
              {t.move}
            </Button>
          </div>
          <span className="text-small text-fg-subtle">{t.folderHint}</span>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-medium text-fg-muted">{t.permissions}</h3>
          <p className="text-small text-fg-muted">{t.intro}</p>
          <PermissionEditor value={workspace.settings} inheritFrom={m.settings.permissions.fromAgent} onSave={(s) => updateWorkspacePermissions(workspace.id, s)} />
        </div>
      </div>
    </Dialog>
  )
}
