import type { ThreadRow } from '@ollupi/protocol'
import { Dialog } from '@ollupi/ui'
import { updateThreadPermissions } from '../../services/actions/threads'
import { PermissionEditor } from './PermissionEditor'

export function ThreadPermissionsDialog({ thread, onClose }: { thread: ThreadRow; onClose(): void }) {
  return (
    <Dialog open title="Thread permissions" onClose={onClose} width={520}>
      <p className="mb-4 text-xs text-fg-muted">
        Applies to this thread from its next step, on top of the workspace and agent defaults.
      </p>
      <PermissionEditor
        value={thread.settings}
        inheritFrom={thread.workspaceId ? 'the workspace' : 'the agent defaults'}
        onSave={async (s) => {
          const ok = await updateThreadPermissions(thread.id, s)
          if (ok) onClose()
          return ok
        }}
      />
    </Dialog>
  )
}
