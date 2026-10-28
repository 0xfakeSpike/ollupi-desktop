// A thread's own permission layer, beside the conversation so the timeline
// stays in view while it is edited.

import type { ThreadRow } from '@ollupi/protocol'
import { updateThreadPermissions } from '../../domains/conversation'
import { useT } from '../../i18n'
import { PermissionEditor } from '../settings/PermissionEditor'
import { SidePanel } from './SidePanel'

export function PermissionsPanel({ thread }: { thread: ThreadRow }) {
  const t = useT().settings.permissions
  return (
    <SidePanel panel="permissions" title={t.thread.title} closeLabel={t.thread.close}>
      <p className="mb-4 text-small text-fg-muted">{t.thread.intro}</p>
      {/* The panel stays open across threads: each thread edits from its own settings. */}
      <PermissionEditor
        key={thread.id}
        value={thread.settings}
        inheritFrom={thread.workspaceId ? t.fromWorkspace : t.fromAgent}
        onSave={(s) => updateThreadPermissions(thread.id, s)}
      />
    </SidePanel>
  )
}
