import type { ThreadRow } from '@ollupi/protocol'
import { Dialog } from '@ollupi/ui'
import { updateThreadPermissions } from '../../domains/conversation'
import { useT } from '../../i18n'
import { PermissionEditor } from './PermissionEditor'

export function ThreadPermissionsDialog({ thread, onClose }: { thread: ThreadRow; onClose(): void }) {
  const m = useT()
  return (
    <Dialog title={m.settings.permissions.thread.title} closeLabel={m.common.close} onClose={onClose}>
      <p className="mb-4 text-small text-fg-muted">{m.settings.permissions.thread.intro}</p>
      <PermissionEditor
        value={thread.settings}
        inheritFrom={thread.workspaceId ? m.settings.permissions.fromWorkspace : m.settings.permissions.fromAgent}
        onSave={async (s) => {
          const ok = await updateThreadPermissions(thread.id, s)
          if (ok) onClose()
          return ok
        }}
      />
    </Dialog>
  )
}
