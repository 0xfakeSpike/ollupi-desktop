import type { ThreadRow } from '@ollupi/protocol'
import { Dialog } from '@ollupi/ui'
import { updateThreadPermissions } from '../../domains/conversation'
import { PermissionEditor } from './PermissionEditor'

export function ThreadPermissionsDialog({ thread, onClose }: { thread: ThreadRow; onClose(): void }) {
  return (
    <Dialog title="Thread permissions" onClose={onClose} width={520}>
      <p className="mb-4 text-xs text-fg-muted">
        Layered over the workspace and agent defaults. A running turn uses them from its next batch of calls.
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
