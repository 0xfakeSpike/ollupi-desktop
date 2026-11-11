import { groupByWorkspace } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { Blocks, Bookmark, Clock, FolderPlus, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { go, useNavigation } from '../../domains/navigation'
import { useThreads } from '../../domains/threads'
import { addWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { UpdatePrompt } from '../common/Update'
import { ConnectionStatus } from './ConnectionStatus'
import { ArchivedThreads } from './ArchivedThreads'
import { ArchivedWorkspaces } from './ArchivedWorkspaces'
import { ThreadGroup } from './ThreadGroup'

/** The app's navigation. A screen with categories of its own (memory,
 * capabilities, settings…) lists them beside this, inside the screen. */
export function Sidebar() {
  const workspaces = useWorkspaces((s) => s.list)
  const threads = useThreads((s) => s.list)
  const screen = useNavigation((s) => s.screen)
  const m = useT().shell.sidebar
  const groups = useMemo(() => groupByWorkspace(workspaces, threads), [workspaces, threads])

  return (
    <aside className="flex w-66 shrink-0 flex-col">
      {/* Level with the screen's 40px header; the traffic lights sit here. */}
      <div className="drag h-10 shrink-0" />
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        <NavButton icon={<Plus size={16} />} primary active={screen.kind === 'draft'} onClick={() => go({ kind: 'draft', workspaceId: undefined })}>
          {m.newThread}
        </NavButton>
        <NavButton icon={<Search size={16} />} active={screen.kind === 'search'} onClick={() => go({ kind: 'search' })} shortcut="⌘K">
          {m.search}
        </NavButton>
        <NavButton icon={<Clock size={16} />} active={screen.kind === 'cron'} onClick={() => go({ kind: 'cron' })}>
          {m.cron}
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
        <NavButton icon={<Bookmark size={16} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
          {m.memory}
        </NavButton>
        <NavButton icon={<Blocks size={16} />} active={screen.kind === 'capabilities'} onClick={() => go({ kind: 'capabilities', tab: 'skills' })}>
          {m.capabilities}
        </NavButton>
        <NavButton icon={<SlidersHorizontal size={16} />} active={screen.kind === 'settings'} onClick={() => go({ kind: 'settings' })}>
          {m.settings}
        </NavButton>
        <ConnectionStatus />
      </div>
    </aside>
  )
}

/** Sidebar rows share one grid: a 16px icon slot at 8px, the label at 32px.
 * Places read muted until chosen; starting a conversation, the primary
 * action, reads in full. */
function NavButton({
  icon,
  primary,
  active,
  onClick,
  shortcut,
  children,
}: {
  icon: ReactNode
  primary?: boolean
  active?: boolean
  onClick(): void
  shortcut?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 items-center gap-2 rounded-md px-2 text-left text-ui transition-colors duration-100 ease-standard',
        'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'bg-selected font-medium text-fg' : primary ? 'font-medium text-fg hover:bg-hover' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-muted">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-small font-normal text-fg-subtle">{shortcut}</span>}
    </button>
  )
}
