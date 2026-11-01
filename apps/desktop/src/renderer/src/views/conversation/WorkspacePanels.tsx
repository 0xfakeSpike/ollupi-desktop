// The panels a workspace gives a conversation, its files, changes and
// terminal: beside a thread, and beside a draft once it has a workspace,
// as they need its folder and not the thread.

import type { WorkspaceRow } from '@ollupi/protocol'
import { IconButton } from '@ollupi/ui'
import { FileDiff, FolderTree, SquareTerminal } from 'lucide-react'
import { togglePanel, useNavigation } from '../../domains/navigation'
import { useT } from '../../i18n'
import { ChangesPanel } from './ChangesPanel'
import { FilesPanel } from './FilesPanel'
import { TerminalPanel } from './TerminalPanel'

export function WorkspacePanelButtons() {
  const panel = useNavigation((s) => s.panel)
  const t = useT().conversation.screen
  return (
    <>
      <IconButton label={t.files} active={panel === 'files'} onClick={() => togglePanel('files')}>
        <FolderTree size={16} />
      </IconButton>
      <IconButton label={t.changes} active={panel === 'changes'} onClick={() => togglePanel('changes')}>
        <FileDiff size={16} />
      </IconButton>
      <IconButton label={t.terminal} active={panel === 'terminal'} onClick={() => togglePanel('terminal')}>
        <SquareTerminal size={16} />
      </IconButton>
    </>
  )
}

/** The workspace panel showing, if one is. */
export function WorkspacePanel({ workspace, turn }: { workspace: WorkspaceRow; /** The running turn, if any. */ turn: string | undefined }) {
  const panel = useNavigation((s) => s.panel)
  // One per workspace: threads of the same workspace, and its drafts, keep
  // its open folders and its shell.
  if (panel === 'files') return <FilesPanel key={workspace.id} workspace={workspace} />
  if (panel === 'changes') return <ChangesPanel key={workspace.id} workspace={workspace} turn={turn} />
  if (panel === 'terminal') return <TerminalPanel key={workspace.id} workspace={workspace} />
  return null
}
