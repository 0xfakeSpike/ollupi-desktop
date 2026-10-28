import { groupByWorkspace } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { Brain, CalendarClock, FolderPlus, Settings, SquarePen } from 'lucide-react'
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
    <aside className="flex w-65 shrink-0 flex-col">
      {/* Level with the screen's 40px header; the traffic lights sit here. */}
      <div className="drag h-10 shrink-0" />
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <NavButton icon={<SquarePen size={16} />} active={screen.kind === 'draft'} onClick={() => go({ kind: 'draft', workspaceId: undefined })}>
          {m.newThread}
        </NavButton>
        <NavButton icon={<FolderPlus size={16} />} onClick={() => void addWorkspace()}>
          {m.addWorkspace}
        </NavButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <ThreadGroup key={g.workspace?.id ?? 'none'} workspace={g.workspace} threads={g.threads} />
        ))}
        <ArchivedWorkspaces workspaces={workspaces.filter((w) => w.archivedAt)} />
      </div>
      <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
        <NavButton icon={<Brain size={16} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
          {m.memory}
        </NavButton>
        <NavButton icon={<CalendarClock size={16} />} active={screen.kind === 'cron'} onClick={() => go({ kind: 'cron' })}>
          {m.cron}
        </NavButton>
        <NavButton icon={<Settings size={16} />} active={screen.kind === 'settings'} onClick={() => go({ kind: 'settings' })}>
          {m.settings}
        </NavButton>
        <ConnectionStatus />
      </div>
    </aside>
  )
}

/** Sidebar rows share one grid: a 16px icon slot at 8px, the label at 32px. */
function NavButton({ icon, active, onClick, children }: { icon: ReactNode; active?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-2 rounded-md px-2 text-left text-ui transition-colors duration-100 ease-standard',
        'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-muted">{icon}</span>
      {children}
    </button>
  )
}
