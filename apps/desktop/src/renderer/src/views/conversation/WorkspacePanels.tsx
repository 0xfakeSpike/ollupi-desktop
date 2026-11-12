// The panels a workspace gives a conversation, its files, its environment
// with the changes in it, and its terminal: beside a thread, and beside a
// draft once it has a workspace, as they need its folder and not the thread.

import type { EnvironmentRow, WorkspaceRow } from '@ollupi/protocol'
import { IconButton } from '@ollupi/ui'
import { FolderTree, GitBranch, SquareTerminal } from 'lucide-react'
import { togglePanel, useNavigation } from '../../domains/navigation'
import { useT } from '../../i18n'
import { EnvironmentPanel } from './EnvironmentPanel'
import { FilesPanel } from './FilesPanel'
import { TerminalPanel } from './TerminalPanel'

/** The workspace panel showing, if one is. */
export function WorkspacePanel({
  workspace,
  environment,
  turn,
}: {
  workspace: WorkspaceRow
  environment: EnvironmentRow | undefined
  /** The running turn, if any. */
  turn: string | undefined
}) {
  const panel = useNavigation((s) => s.panel)
  // One per workspace: threads of the same workspace, and its drafts, keep
  // its open folders and its shell.
  if (panel === 'files') return <FilesPanel key={workspace.id} workspace={workspace} />
  if (panel === 'environment') return <EnvironmentPanel key={workspace.id} workspace={workspace} environment={environment} turn={turn} />
  if (panel === 'terminal') return <TerminalPanel key={workspace.id} workspace={workspace} />
  return null
}
