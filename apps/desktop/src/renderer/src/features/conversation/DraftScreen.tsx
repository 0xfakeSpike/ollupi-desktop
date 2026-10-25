// A thread that does not exist yet: pick where it runs, write the first
// message, and the thread is created on send.

import { ChevronDown, Folder } from 'lucide-react'
import { startThread } from '../../services/actions/threads'
import { addWorkspace } from '../../services/actions/workspaces'
import { useCatalog, useWorkspace } from '../../stores/catalog'
import { useNavigation } from '../../stores/navigation'
import { Composer } from './Composer'
import { ModelPicker } from './ModelPicker'

export function DraftScreen({ workspaceId }: { workspaceId: string | undefined }) {
  const workspace = useWorkspace(workspaceId)
  return (
    <div className="flex h-full flex-col">
      <div className="drag h-[52px] shrink-0" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">What should we work on?</h1>
        <p className="text-sm text-fg-muted">
          {workspace ? (
            <>
              Commands run in <span className="font-mono text-xs">{workspace.rootPath}</span>
            </>
          ) : (
            'Not tied to a project folder. Pick a workspace to let the agent work on your code.'
          )}
        </p>
      </div>
      <Composer
        autoFocus
        placeholder="Describe a task or ask a question"
        onSubmit={(text) => startThread(workspaceId, text)}
        toolbar={
          <>
            <WorkspacePicker workspaceId={workspaceId} />
            <ModelPicker fallback={undefined} />
          </>
        }
      />
    </div>
  )
}

const ADD = '__add__'

function WorkspacePicker({ workspaceId }: { workspaceId: string | undefined }) {
  const workspaces = useCatalog((s) => s.workspaces).filter((w) => !w.archivedAt)
  const go = useNavigation((s) => s.go)
  const current = workspaces.find((w) => w.id === workspaceId)
  return (
    <label className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg">
      <Folder size={13} />
      <span className="max-w-48 truncate">{current?.name ?? 'No workspace'}</span>
      <ChevronDown size={12} />
      <select
        aria-label="Workspace"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={workspaceId ?? ''}
        onChange={(e) => {
          if (e.target.value === ADD) void addWorkspace()
          else go({ kind: 'draft', workspaceId: e.target.value || undefined })
        }}
      >
        <option value="">No workspace</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value={ADD}>Add workspace…</option>
      </select>
    </label>
  )
}
