import { groupThreadsByWorkspace, topLevelThreads } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { Brain, FolderPlus, Settings, SquarePen } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { newDraft } from '../../services/actions/threads'
import { addWorkspace } from '../../services/actions/workspaces'
import { useCatalog } from '../../stores/catalog'
import { useNavigation } from '../../stores/navigation'
import { ConnectionIndicator } from './ConnectionIndicator'
import { WorkspaceSection } from './WorkspaceSection'

export function Sidebar() {
  const workspaces = useCatalog((s) => s.workspaces)
  const threads = useCatalog((s) => s.threads)
  const screen = useNavigation((s) => s.screen)
  const go = useNavigation((s) => s.go)
  const groups = useMemo(() => groupThreadsByWorkspace(workspaces, topLevelThreads(threads)), [workspaces, threads])

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="drag h-[52px] shrink-0" />
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <NavButton icon={<SquarePen size={15} />} active={screen.kind === 'draft'} onClick={() => newDraft()}>
          New thread
        </NavButton>
        <NavButton icon={<FolderPlus size={15} />} onClick={() => void addWorkspace()}>
          Add workspace
        </NavButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <WorkspaceSection key={g.workspace?.id ?? 'loose'} workspace={g.workspace} threads={g.threads} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-line px-2 py-2">
        <NavButton icon={<Brain size={15} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
          Memory
        </NavButton>
        <NavButton
          icon={<Settings size={15} />}
          active={screen.kind === 'settings'}
          onClick={() => go({ kind: 'settings' })}
        >
          Settings
        </NavButton>
        <ConnectionIndicator />
      </div>
    </aside>
  )
}

export function NavButton({
  icon,
  active,
  onClick,
  children,
}: {
  icon: ReactNode
  active?: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition',
        active ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      <span className="text-fg-muted">{icon}</span>
      {children}
    </button>
  )
}
