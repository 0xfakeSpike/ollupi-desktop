// A thread that does not exist yet: pick where it runs and write the first
// message; sending creates it. Its workspace's panels and a browser show
// beside it; the pages it opens become the thread's.

import { IconButton } from '@ollupi/ui'
import { ChevronDown, Folder, Globe } from 'lucide-react'
import { DRAFT_BROWSER } from '../../../../shared/ipc'
import { startThread } from '../../domains/conversation'
import { go, togglePanel, useNavigation } from '../../domains/navigation'
import { activeWorkspaces, addWorkspace, useWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { BrowserPanel } from '../conversation/BrowserPanel'
import { Composer } from '../conversation/Composer'
import { ModelPicker } from '../conversation/ModelPicker'
import { WorkspacePanel, WorkspacePanelButtons } from '../conversation/WorkspacePanels'
import { Pup } from './Pup'

export function DraftScreen({ workspaceId }: { workspaceId: string | undefined }) {
  const workspace = useWorkspace(workspaceId)
  const panel = useNavigation((s) => s.panel)
  const m = useT()
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center justify-end gap-2 pr-2">
        <IconButton label={m.conversation.screen.browser} active={panel === 'browser'} onClick={() => togglePanel('browser')}>
          <Globe size={16} />
        </IconButton>
        {workspace && <WorkspacePanelButtons />}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10">
            <h1 className="text-display text-fg">{m.conversation.draft.title}</h1>
            <p className="text-ui text-fg-muted">
              {workspace ? (
                m.conversation.draft.commandsRunIn(<span className="font-mono text-small">{workspace.rootPath}</span>)
              ) : (
                m.conversation.draft.noFolder
              )}
            </p>
          </div>
          <Composer
            placeholder={m.conversation.draft.placeholder}
            onSubmit={(message) => startThread(workspaceId, message)}
            perch={<Pup />}
            toolbar={
              <>
                <WorkspacePicker workspaceId={workspaceId} />
                <ModelPicker inherited={undefined} />
              </>
            }
          />
        </div>
        {panel === 'browser' && <BrowserPanel thread={DRAFT_BROWSER} />}
        {workspace && <WorkspacePanel workspace={workspace} turn={undefined} />}
      </div>
    </div>
  )
}

const ADD = '__add__'

function WorkspacePicker({ workspaceId }: { workspaceId: string | undefined }) {
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list))
  const current = workspaces.find((w) => w.id === workspaceId)
  const m = useT()
  return (
    <label className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-small text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg">
      <Folder size={14} />
      <span className="max-w-48 truncate">{current?.name ?? m.conversation.draft.noWorkspace}</span>
      <ChevronDown size={14} />
      <select
        aria-label={m.conversation.draft.workspace}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={workspaceId ?? ''}
        onChange={(e) => (e.target.value === ADD ? void addWorkspace() : go({ kind: 'draft', workspaceId: e.target.value || undefined }))}
      >
        <option value="">{m.conversation.draft.noWorkspace}</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value={ADD}>{m.conversation.draft.addWorkspace}</option>
      </select>
    </label>
  )
}
