import { groupByWorkspace } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { Brain, FolderPlus, Settings, SquarePen } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { go, useNavigation } from '../../domains/navigation'
import { useThreads } from '../../domains/threads'
import { addWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { ConnectionStatus } from './ConnectionStatus'
import { ArchivedWorkspaces } from './ArchivedWorkspaces'
import { ThreadGroup } from './ThreadGroup'

export function Sidebar() {
  const workspaces = useWorkspaces((s) => s.list)
  const threads = useThreads((s) => s.list)
  const screen = useNavigation((s) => s.screen)
  const m = useT().shell.sidebar
  const groups = useMemo(() => groupByWorkspace(workspaces, threads), [workspaces, threads])

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="drag h-[52px] shrink-0" />
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <NavButton icon={<SquarePen size={15} />} active={screen.kind === 'draft'} onClick={() => go({ kind: 'draft', workspaceId: undefined })}>
          {m.newThread}
        </NavButton>
        <NavButton icon={<FolderPlus size={15} />} onClick={() => void addWorkspace()}>
          {m.addWorkspace}
        </NavButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <ThreadGroup key={g.workspace?.id ?? 'none'} workspace={g.workspace} threads={g.threads} />
        ))}
        <ArchivedWorkspaces workspaces={workspaces.filter((w) => w.archivedAt)} />
      </div>
      <div className="flex flex-col gap-0.5 border-t border-line px-2 py-2">
        <NavButton icon={<Brain size={15} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
          {m.memory}
        </NavButton>
        <NavButton icon={<Settings size={15} />} active={screen.kind === 'settings'} onClick={() => go({ kind: 'settings' })}>
          {m.settings}
        </NavButton>
        <ConnectionStatus />
      </div>
    </aside>
  )
}

function NavButton({ icon, active, onClick, children }: { icon: ReactNode; active?: boolean; onClick(): void; children: ReactNode }) {
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
