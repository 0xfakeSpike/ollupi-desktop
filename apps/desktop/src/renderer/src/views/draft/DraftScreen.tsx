// A thread that does not exist yet: pick where it runs and write the first
// message; sending creates it.

import { ChevronDown, Folder } from 'lucide-react'
import { startThread } from '../../domains/conversation'
import { go } from '../../domains/navigation'
import { activeWorkspaces, addWorkspace, useWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { Composer } from '../conversation/Composer'
import { ModelPicker } from '../conversation/ModelPicker'

export function DraftScreen({ workspaceId }: { workspaceId: string | undefined }) {
  const workspace = useWorkspace(workspaceId)
  const m = useT()
  return (
    <div className="flex h-full flex-col">
      <div className="drag h-[52px] shrink-0" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{m.conversation.draft.title}</h1>
        <p className="text-sm text-fg-muted">
          {workspace ? (
            m.conversation.draft.commandsRunIn(<span className="font-mono text-xs">{workspace.rootPath}</span>)
          ) : (
            m.conversation.draft.noFolder
          )}
        </p>
      </div>
      <Composer
        placeholder={m.conversation.draft.placeholder}
        onSubmit={(text) => startThread(workspaceId, text)}
        toolbar={
          <>
            <WorkspacePicker workspaceId={workspaceId} />
            <ModelPicker inherited={undefined} />
          </>
        }
      />
    </div>
  )
}

const ADD = '__add__'

function WorkspacePicker({ workspaceId }: { workspaceId: string | undefined }) {
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list))
  const current = workspaces.find((w) => w.id === workspaceId)
  const m = useT()
  return (
    <label className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg">
      <Folder size={13} />
      <span className="max-w-48 truncate">{current?.name ?? m.conversation.draft.noWorkspace}</span>
      <ChevronDown size={12} />
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
