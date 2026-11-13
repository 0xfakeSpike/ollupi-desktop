import { groupByWorkspace } from '@ollupi/core'
import { cn, useTooltip } from '@ollupi/ui'
import { ArrowDown, Blocks, Bookmark, Clock, FolderPlus, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { go, useNavigation } from '../../domains/navigation'
import { useThreads } from '../../domains/threads'
import { addWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { UpdatePrompt } from '../common/Update'
import { ConnectionStatus } from './ConnectionStatus'
import { ArchivedThreads } from './ArchivedThreads'
import { ArchivedWorkspaces } from './ArchivedWorkspaces'
import { ThreadGroup } from './ThreadGroup'
import { Wordmark } from '../common/Wordmark'

/** The app's navigation. A screen with categories of its own (memory,
 * capabilities, settings…) lists them beside this, inside the screen. */
export function Sidebar() {
  const workspaces = useWorkspaces((s) => s.list)
  const threads = useThreads((s) => s.list)
  const screen = useNavigation((s) => s.screen)
  const m = useT().shell.sidebar
  const groups = useMemo(() => groupByWorkspace(workspaces, threads), [workspaces, threads])
  const list = useRef<HTMLDivElement>(null)
  const hidden = useHiddenWaiting(list)

  return (
    <aside className="flex w-70 shrink-0 flex-col">
      {/* Level with the screen's 40px header; the traffic lights sit here, and
          the wordmark at its far end, so the app is named on every screen. */}
      <div className="drag flex h-10 shrink-0 items-center justify-end pr-5.5">
        <Wordmark className="h-5 w-auto text-fg-muted" />
      </div>
      {/* A new thing is the one action; searching and the schedule sit beside it as capsules. */}
      <nav className="flex gap-2 px-3.5 pb-1">
        <button
          type="button"
          onClick={() => go({ kind: 'draft', workspaceId: undefined })}
          aria-current={screen.kind === 'draft' ? 'page' : undefined}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-ink px-4 text-ui font-semibold text-ink-fg transition-opacity duration-100 ease-standard hover:opacity-90 focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          <Plus size={16} className="shrink-0" />
          <span className="truncate">{m.newThread}</span>
          <span className="ml-auto text-small font-medium opacity-75">⌘N</span>
        </button>
        <CapsuleButton label={m.search} hint="⌘K" active={screen.kind === 'search'} onClick={() => go({ kind: 'search' })}>
          <Search size={16} />
        </CapsuleButton>
        <CapsuleButton label={m.cron} active={screen.kind === 'cron'} onClick={() => go({ kind: 'cron' })}>
          <Clock size={16} />
        </CapsuleButton>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} className="fade-edges min-h-0 flex-1 overflow-y-auto px-3.5 pt-2 pb-4">
        {groups
          .filter((g) => g.workspace)
          .map((g) => (
            <ThreadGroup key={g.workspace!.id} workspace={g.workspace} threads={g.threads} />
          ))}
        {/* Adding one is occasional, so it ends the workspaces rather than leading the sidebar. */}
        <button
          type="button"
          onClick={() => void addWorkspace()}
          className="mt-2.5 flex h-9 w-full items-center gap-2 rounded-full px-4 text-left text-small font-medium text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          <FolderPlus size={14} className="shrink-0" />
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
      {/* Something waits for you further down the map: say so at its edge,
          in a band of its own so it covers no row. */}
      {hidden.count > 0 && (
        <div className="flex shrink-0 justify-center pb-1">
          <button
            type="button"
            onClick={hidden.reveal}
            className="flex h-8 animate-enter items-center gap-1.5 rounded-full bg-accent px-3.5 text-small font-semibold whitespace-nowrap text-accent-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none motion-reduce:animate-fade"
          >
            {m.areaWaiting(hidden.count)}
            <ArrowDown size={14} aria-hidden />
          </button>
        </div>
      )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 pt-2 pb-3">
        <UpdatePrompt />
        <div className="flex flex-wrap gap-1">
          <NavButton icon={<Bookmark size={14} />} active={screen.kind === 'memory'} onClick={() => go({ kind: 'memory' })}>
            {m.memory}
          </NavButton>
          <NavButton icon={<Blocks size={14} />} active={screen.kind === 'capabilities'} onClick={() => go({ kind: 'capabilities', tab: 'skills' })}>
            {m.capabilities}
          </NavButton>
          <NavButton icon={<SlidersHorizontal size={14} />} active={screen.kind === 'settings'} onClick={() => go({ kind: 'settings' })}>
            {m.settings}
          </NavButton>
        </div>
        <ConnectionStatus />
      </div>
    </aside>
  )
}

/** The places below the map: memory, capabilities, settings, as small
 * capsules in one row; the open one sits on the sheet's colour. */
function NavButton({ icon, active, onClick, children }: { icon: ReactNode; active?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-medium transition-colors duration-100 ease-standard',
        'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'bg-canvas text-fg shadow-sm' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** An icon capsule beside the new-thing button, named by its tooltip. */
function CapsuleButton({ label, hint, active, onClick, children }: { label: string; hint?: string; active?: boolean; onClick(): void; children: ReactNode }) {
  const tip = useTooltip({ label, hint })
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-fg-muted transition-colors duration-100 ease-standard hover:text-fg',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          active && 'text-fg shadow-sm',
        )}
        {...tip.trigger}
      >
        {children}
      </button>
      {tip.tooltip}
    </>
  )
}

/** The waiting rows (data-waiting) scrolled out of the sidebar's view, and
 * a way to the first of them. */
function useHiddenWaiting(list: RefObject<HTMLElement | null>): { count: number; reveal(): void } {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const root = list.current
    if (!root) return
    const shown = new Map<Element, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) shown.set(e.target, e.isIntersecting)
        setCount([...shown].filter(([el, seen]) => el.isConnected && !seen).length)
      },
      { root },
    )
    const watch = () => {
      for (const el of [...shown.keys()]) {
        if (!el.isConnected || !el.hasAttribute('data-waiting')) {
          io.unobserve(el)
          shown.delete(el)
        }
      }
      for (const el of root.querySelectorAll('[data-waiting]')) {
        if (!shown.has(el)) {
          shown.set(el, true)
          io.observe(el)
        }
      }
      setCount([...shown.values()].filter((seen) => !seen).length)
    }
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-waiting'] })
    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [list])
  const reveal = () => {
    const row = [...(list.current?.querySelectorAll<HTMLElement>('[data-waiting]') ?? [])][0]
    row?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  return { count, reveal }
}
