import { groupByWorkspace } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { ArrowLeft, Blocks, Brain, CalendarClock, Cpu, FolderPlus, Search, Settings, SlidersHorizontal, SquarePen } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { go, leaveSettings, useNavigation, type SettingsTab } from '../../domains/navigation'
import { useThreads } from '../../domains/threads'
import { addWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { UpdatePrompt } from '../common/Update'
import { ConnectionStatus } from './ConnectionStatus'
import { ArchivedThreads } from './ArchivedThreads'
import { ArchivedWorkspaces } from './ArchivedWorkspaces'
import { ThreadGroup } from './ThreadGroup'

/** The app's navigation; while settings are open, their categories take its
 * place, so there is one column of navigation at a time. */
export function Sidebar() {
  const screen = useNavigation((s) => s.screen)
  return screen.kind === 'settings' ? <SettingsSidebar tab={screen.tab} /> : <MainSidebar />
}

function MainSidebar() {
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
        <NavButton icon={<Search size={16} />} active={screen.kind === 'search'} onClick={() => go({ kind: 'search' })} shortcut="⌘K">
          {m.search}
        </NavButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups
          .filter((g) => g.workspace)
          .map((g) => (
            <ThreadGroup key={g.workspace!.id} workspace={g.workspace} threads={g.threads} />
          ))}
        {/* Adding one is occasional, so it ends the workspaces rather than leading the sidebar. */}
        <button
          type="button"
          onClick={() => void addWorkspace()}
          className="mt-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-small text-fg-subtle transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg-muted focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <FolderPlus size={14} />
          </span>
          {m.addWorkspace}
        </button>
        {groups
          .filter((g) => !g.workspace)
          .map((g) => (
            <ThreadGroup key="none" workspace={undefined} threads={g.threads} />
          ))}
        <ArchivedThreads />
        <ArchivedWorkspaces workspaces={workspaces.filter((w) => w.archivedAt)} />
      </div>
      <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
        <UpdatePrompt />
        <NavButton icon={<Brain size={16} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
          {m.memory}
        </NavButton>
        <NavButton icon={<CalendarClock size={16} />} active={screen.kind === 'cron'} onClick={() => go({ kind: 'cron' })}>
          {m.cron}
        </NavButton>
        <NavButton icon={<Blocks size={16} />} active={screen.kind === 'capabilities'} onClick={() => go({ kind: 'capabilities', tab: 'skills' })}>
          {m.capabilities}
        </NavButton>
        <NavButton icon={<Settings size={16} />} onClick={() => go({ kind: 'settings', tab: 'general' })}>
          {m.settings}
        </NavButton>
        <ConnectionStatus />
      </div>
    </aside>
  )
}

const settingsTabs: { id: SettingsTab; icon: ReactNode }[] = [
  { id: 'general', icon: <SlidersHorizontal size={16} /> },
  { id: 'models', icon: <Cpu size={16} /> },
]

function SettingsSidebar({ tab }: { tab: SettingsTab }) {
  const t = useT()
  return (
    <aside className="flex w-65 shrink-0 flex-col">
      <div className="drag h-10 shrink-0" />
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <NavButton icon={<ArrowLeft size={16} />} onClick={leaveSettings}>
          {t.shell.sidebar.back}
        </NavButton>
      </nav>
      <nav aria-label={t.shell.sidebar.settings} className="mt-3 flex flex-1 flex-col gap-0.5 px-2">
        <h2 className="flex h-7 items-center pl-2 text-small font-medium text-fg-subtle">{t.shell.sidebar.settings}</h2>
        {settingsTabs.map((s) => (
          <NavButton key={s.id} icon={s.icon} active={s.id === tab} onClick={() => go({ kind: 'settings', tab: s.id })}>
            {t.settings.screen.tabs[s.id].label}
          </NavButton>
        ))}
      </nav>
      <div className="px-2 pt-2 pb-3">
        <ConnectionStatus />
      </div>
    </aside>
  )
}

/** Sidebar rows share one grid: a 16px icon slot at 8px, the label at 32px. */
function NavButton({ icon, active, onClick, shortcut, children }: { icon: ReactNode; active?: boolean; onClick(): void; shortcut?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 items-center gap-2 rounded-md px-2 text-left text-ui transition-colors duration-100 ease-standard',
        'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-muted">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-small font-normal text-fg-subtle">{shortcut}</span>}
    </button>
  )
}
