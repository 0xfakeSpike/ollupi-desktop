import type { WorkspaceRow } from '@ollupi/protocol'
import { AutoTextarea, Button, Dialog, Field, Input } from '@ollupi/ui'
import { useState } from 'react'
import { moveWorkspace, renameWorkspace, updateWorkspaceInstructions, updateWorkspacePermissions } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { FolderBrowser } from '../common/FolderBrowser'
import { PermissionEditor } from './PermissionEditor'

/** ollupi takes at most this many characters of a workspace's instructions. */
const MAX_INSTRUCTIONS = 20_000

/** A workspace's name, folder, instructions and permissions. The Super
 * Agent's hub is named by the app and its folder holds no project, so it
 * has only its instructions and permissions; a scratch workspace is its
 * environment's own folder, which stays, so it has those too. */
export function WorkspaceSettingsDialog({ workspace, onClose }: { workspace: WorkspaceRow; onClose(): void }) {
  const m = useT()
  const t = m.settings.permissions.workspace
  const hub = workspace.kind === 'hub'
  const own = hub || workspace.kind === 'scratch'
  // Where the folder would move to, browsed on its environment's machine.
  const [moving, setMoving] = useState(false)
  const [target, setTarget] = useState<string>()
  const [name, setName] = useState(workspace.name)
  const [instructions, setInstructions] = useState(workspace.instructions ?? '')
  const saveInstructions = () => {
    if (instructions.trim() !== (workspace.instructions ?? '').trim()) void updateWorkspaceInstructions(workspace.id, instructions.trim())
  }
  const rename = () => {
    const next = name.trim()
    if (next && next !== workspace.name) void renameWorkspace(workspace.id, next)
  }
  // The folder moves to the one picked, which has to be empty; the workspace
  // keeps its id, so its conversations, memories and tasks stay its own.
  const move = async () => {
    if (!target || !confirm(t.moveConfirm(target))) return
    await moveWorkspace(workspace.id, target)
    setMoving(false)
  }
  return (
    <Dialog title={hub ? t.hubTitle : t.title} closeLabel={m.common.close} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!own && (
          <>
            <Field label={t.name}>
              <Input value={name} className="max-w-60" onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-ui font-medium text-fg">{t.folder}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 selectable font-mono text-small break-all text-fg-muted">{workspace.rootPath}</span>
                <Button size="sm" aria-pressed={moving} onClick={() => setMoving((v) => !v)}>
                  {t.move}
                </Button>
              </div>
              <span className="text-small text-fg-subtle">{t.folderHint}</span>
              {moving && (
                <div className="mt-2 flex flex-col gap-2">
                  <FolderBrowser environmentId={workspace.environmentId} onAt={setTarget} />
                  <div className="flex justify-end">
                    <Button size="sm" variant="primary" disabled={!target || target === workspace.rootPath} onClick={() => void move()}>
                      {t.moveHere}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        <Field label={t.instructions} hint={`${hub ? t.hubInstructionsHint : t.instructionsHint} ${t.instructionsLimit(MAX_INSTRUCTIONS)}`}>
          <AutoTextarea
            value={instructions}
            maxLength={MAX_INSTRUCTIONS}
            maxRows={10}
            placeholder={t.instructionsPlaceholder}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={saveInstructions}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-medium text-fg-muted">{t.permissions}</h3>
          <p className="text-small text-fg-muted">{t.intro}</p>
          <PermissionEditor value={workspace.settings} inheritFrom={m.settings.permissions.fromAgent} onSave={(s) => updateWorkspacePermissions(workspace.id, s)} />
        </div>
      </div>
    </Dialog>
  )
}
