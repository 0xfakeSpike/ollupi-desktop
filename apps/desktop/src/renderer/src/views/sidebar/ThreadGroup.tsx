import { isWorking, needsUser } from '@ollupi/core'
import type { ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { Archive, ChevronRight, Folder, FolderOpen, Inbox, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { openThread } from '../../domains/conversation'
import { go, useOpenThreadId } from '../../domains/navigation'
import { archiveThread, deleteThread, loadMoreThreads, renameThread, useThreads } from '../../domains/threads'
import { setArchived } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'
import { desktop } from '../../platform/desktop'
import { TitleInput } from '../common/TitleInput'
import { WorkspaceSettingsDialog } from '../settings/WorkspaceSettingsDialog'

const SHOWN = 8

/** One workspace's threads, or the threads outside any workspace. */
export function ThreadGroup({ workspace, threads }: { workspace: WorkspaceRow | undefined; threads: ThreadSummary[] }) {
  const [open, setOpen] = useState(true)
  const [all, setAll] = useState(false)
  const [settings, setSettings] = useState(false)
  const more = useThreads((s) => s.more[workspace?.id ?? ''] ?? false)
  const m = useT().shell.sidebar
  if (!workspace && threads.length === 0) return null
  const visible = all ? threads : threads.slice(0, SHOWN)

  return (
    <section className="mt-3">
      <div className="group flex h-7 items-center gap-1 rounded-md pr-0.5 pl-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title={workspace?.rootPath}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-small font-medium text-fg-subtle transition-colors duration-100 ease-standard hover:text-fg-muted"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {workspace ? <Folder size={14} /> : <Inbox size={14} />}
          </span>
          <span className="truncate">{workspace ? workspace.name : m.noWorkspace}</span>
          <ChevronRight
            size={14}
            aria-hidden
            className={cn('shrink-0 opacity-0 transition duration-160 ease-standard group-hover:opacity-100', open && 'rotate-90')}
          />
        </button>
        {workspace && (
          // Takes room only when shown, so the name uses the row's width.
          <div className="hidden group-focus-within:flex group-hover:flex">
            <IconButton label={m.revealFolder} size="sm" onClick={() => void desktop.openPath(workspace.rootPath)}>
              <FolderOpen size={14} />
            </IconButton>
            <IconButton label={m.workspaceSettings} size="sm" onClick={() => setSettings(true)}>
              <Settings2 size={14} />
            </IconButton>
            <IconButton label={m.archive(workspace.name)} size="sm" onClick={() => void setArchived(workspace.id, true)}>
              <Archive size={14} />
            </IconButton>
            <IconButton label={m.newThreadIn(workspace.name)} size="sm" onClick={() => go({ kind: 'draft', workspaceId: workspace.id })}>
              <Plus size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {visible.map((t) => (
            <ThreadEntry key={t.id} thread={t} />
          ))}
          {workspace && threads.length === 0 && <li className="flex h-7 items-center pl-8 text-small text-fg-subtle">{m.noThreads}</li>}
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
      <button type="button" onClick={onClick} className="flex h-7 items-center pl-8 text-small text-fg-subtle hover:text-fg-muted">
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
  if (renaming) {
    return (
      <li className="flex h-7 items-center pr-1 pl-7">
        <TitleInput initial={thread.title} label={s.renameThread} className="h-6 w-full text-ui" onSave={(t) => renameThread(thread.id, t)} onDone={() => setRenaming(false)} />
      </li>
    )
  }
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => void openThread(thread.id)}
        onDoubleClick={() => setRenaming(true)}
        className={cn(
          'flex h-7 w-full items-center gap-2 rounded-md pr-2 pl-8 text-left text-ui transition-colors duration-100 ease-standard',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          active ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="flex shrink-0 items-center group-focus-within:invisible group-hover:invisible">
          {needsUser(thread.status) ? (
            <span className="size-1.5 rounded-full bg-accent" title={s.waiting} />
          ) : isWorking(thread.status) ? (
            <Spinner size={14} className="text-fg-subtle" />
          ) : (
            <span className="text-small font-normal text-fg-subtle tabular-nums">{relativeTime(m, locale, thread.updatedAt)}</span>
          )}
        </span>
      </button>
      {/* Beside the row rather than in it: a button may not hold buttons. */}
      <div className="absolute inset-y-0 right-0.5 hidden items-center group-focus-within:flex group-hover:flex">
        <IconButton label={s.renameThread} size="sm" onClick={() => setRenaming(true)}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label={s.archiveThread} size="sm" onClick={() => void archiveThread(thread.id, true)}>
          <Archive size={13} />
        </IconButton>
        <IconButton
          label={s.deleteThread}
          size="sm"
          onClick={() => {
            if (confirm(s.deleteThreadConfirm(title))) void deleteThread(thread.id)
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </li>
  )
}
