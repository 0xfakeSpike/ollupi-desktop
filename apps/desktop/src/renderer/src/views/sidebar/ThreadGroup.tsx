import { isWorking, needsUser, unread } from '@ollupi/core'
import type { ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, useTooltip } from '@ollupi/ui'
import { Archive, ChevronRight, Ellipsis, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { openThread } from '../../domains/conversation'
import { openPath } from '../../domains/files'
import { go, useOpenThreadId } from '../../domains/navigation'
import { archiveThread, deleteThread, loadMoreThreads, renameThread, threadMenu, useThreads, workspaceMenu } from '../../domains/threads'
import { setArchived } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'
import { areaClass } from '../common/areas'
import { TitleInput } from '../common/TitleInput'
import { WorkspaceSettingsDialog } from '../settings/WorkspaceSettingsDialog'

const SHOWN = 8

/** One workspace's threads, as an area on the map: a field in the
 * workspace's colour holding its name, how many things are in it, and a
 * row for each. Threads outside any workspace sit on the bare ground. */
export function ThreadGroup({ workspace, threads }: { workspace: WorkspaceRow | undefined; threads: ThreadSummary[] }) {
  const [open, setOpen] = useState(true)
  const [all, setAll] = useState(false)
  const [settings, setSettings] = useState(false)
  const more = useThreads((s) => s.more[workspace?.id ?? ''] ?? false)
  const m = useT().shell.sidebar
  const rootTip = useTooltip({ label: workspace?.rootPath ?? '' })
  if (!workspace && threads.length === 0) return null
  const visible = all ? threads : threads.slice(0, SHOWN)
  const waiting = threads.filter((t) => needsUser(t.status)).length
  const menu = async () => {
    if (!workspace) return
    const picked = await workspaceMenu({ reveal: m.revealFolder, settings: m.workspaceSettings, archive: m.archiveWorkspace })
    if (picked === 'reveal') void openPath(workspace.rootPath)
    else if (picked === 'settings') setSettings(true)
    else if (picked === 'archive') void setArchived(workspace.id, true)
  }

  return (
    <section className={cn('mt-2.5 rounded-3xl p-1.5', workspace ? areaClass(workspace.id) : 'bg-canvas/60')}>
      <div className="group flex h-7 items-center gap-1 pr-0.5 pl-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left text-small font-semibold text-fg"
          {...rootTip.trigger}
        >
          <span className="truncate">{workspace ? workspace.name : m.noWorkspace}</span>
          <span className="shrink-0 font-medium text-fg-muted">{m.things(threads.length)}</span>
          {/* The area says it has something for you, even folded or scrolled past its rows. */}
          {waiting > 0 && <span className="shrink-0 self-center rounded-full bg-accent px-2 text-caption leading-5 font-semibold text-accent-fg">{m.areaWaiting(waiting)}</span>}
          <ChevronRight
            size={12}
            aria-hidden
            className={cn('shrink-0 self-center text-fg-muted opacity-0 transition duration-160 ease-standard group-hover:opacity-100', open && 'rotate-90')}
          />
        </button>
        {workspace && rootTip.tooltip}
        {workspace && (
          // Two on hover (DESIGN.md 3.6): a new thing here, and the rest in the menu.
          <div className="hidden group-focus-within:flex group-hover:flex">
            <IconButton label={m.newThreadIn(workspace.name)} size="sm" onClick={() => go({ kind: 'draft', workspaceId: workspace.id })}>
              <Plus size={14} />
            </IconButton>
            <IconButton label={m.workspaceMenu} size="sm" aria-haspopup="menu" onClick={() => void menu()}>
              <Ellipsis size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {visible.map((t) => (
            <ThreadEntry key={t.id} thread={t} />
          ))}
          {workspace && threads.length === 0 && <li className="flex h-8 items-center px-2.5 text-small text-fg-muted">{m.noThreads}</li>}
          {/* The threads read so far show 8 at first; past them, the next page is read. */}
          {threads.length > SHOWN && !all && <MoreButton onClick={() => setAll(true)}>{m.showMore(threads.length - SHOWN)}</MoreButton>}
          {(all || threads.length <= SHOWN) && more && (
            <MoreButton
              onClick={() => {
                setAll(true)
                void loadMoreThreads(workspace?.id)
              }}
            >
              {m.loadMore}
            </MoreButton>
          )}
          {all && threads.length > SHOWN && <MoreButton onClick={() => setAll(false)}>{m.showLess}</MoreButton>}
        </ul>
      )}
      {workspace && settings && <WorkspaceSettingsDialog workspace={workspace} onClose={() => setSettings(false)} />}
    </section>
  )
}

function MoreButton({ onClick, children }: { onClick(): void; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex h-8 items-center px-2.5 text-small font-medium text-fg-muted hover:text-fg">
        {children}
      </button>
    </li>
  )
}

function ThreadEntry({ thread }: { thread: ThreadSummary }) {
  const active = useOpenThreadId() === thread.id
  const [renaming, setRenaming] = useState(false)
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const title = threadTitle(m, thread)
  const s = m.shell.sidebar
  // A turn ended after the person last read it: its title reads in full, with a dot.
  const fresh = unread(thread)
  // Two actions show on hover (DESIGN.md 3.6): archiving, which can be
  // undone, and the menu; renaming and deleting are in the menu, which a
  // right click on the row opens too.
  const menu = async () => {
    const picked = await threadMenu({ rename: s.renameThread, archive: s.archiveThread, delete: s.deleteThread })
    if (picked === 'rename') setRenaming(true)
    else if (picked === 'archive') void archiveThread(thread.id, true)
    else if (picked === 'delete' && confirm(s.deleteThreadConfirm(title))) void deleteThread(thread.id)
  }
  if (renaming) {
    return (
      <li className="flex h-9 items-center px-1">
        <TitleInput initial={thread.title} label={s.renameThread} className="h-7 w-full rounded-full px-2.5 text-ui" onSave={(t) => renameThread(thread.id, t)} onDone={() => setRenaming(false)} />
      </li>
    )
  }
  return (
    <li className="group relative" data-waiting={needsUser(thread.status) || undefined}>
      <button
        type="button"
        onClick={() => void openThread(thread.id)}
        onDoubleClick={() => setRenaming(true)}
        onContextMenu={(e) => {
          e.preventDefault()
          void menu()
        }}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-full px-2.5 text-left text-ui text-fg transition-colors duration-100 ease-standard',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          active ? 'bg-canvas font-semibold shadow-sm' : fresh ? 'font-semibold hover:bg-canvas/50' : 'font-medium hover:bg-canvas/50',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="flex shrink-0 items-center group-focus-within:invisible group-hover:invisible">
          {/* One word for where it stands: yours, working, new; otherwise when it last moved. */}
          {needsUser(thread.status) ? (
            <span aria-label={s.waiting} className="rounded-full bg-accent px-2 text-caption leading-5 font-semibold text-accent-fg">
              {s.yours}
            </span>
          ) : isWorking(thread.status) ? (
            <span className="rounded-full bg-canvas/60 px-2 text-caption leading-5 font-semibold text-fg-muted">{s.working}</span>
          ) : fresh ? (
            <span role="img" aria-label={s.unread} className="size-1.5 rounded-full bg-fg" />
          ) : (
            <span className="text-small font-medium text-fg-muted tabular-nums">{relativeTime(m, locale, thread.updatedAt)}</span>
          )}
        </span>
      </button>
      {/* Beside the row rather than in it: a button may not hold buttons. */}
      <div className="absolute inset-y-0 right-1.5 hidden items-center group-focus-within:flex group-hover:flex">
        <IconButton label={s.archiveThread} size="sm" onClick={() => void archiveThread(thread.id, true)}>
          <Archive size={13} />
        </IconButton>
        <IconButton label={s.threadMenu} size="sm" aria-haspopup="menu" onClick={() => void menu()}>
          <Ellipsis size={13} />
        </IconButton>
      </div>
    </li>
  )
}
