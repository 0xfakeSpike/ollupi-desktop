import { isWorking, needsUser } from '@ollupi/core'
import type { ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { Archive, ChevronRight, Folder, FolderOpen, Inbox, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { openThread } from '../../domains/conversation'
import { go, useOpenThreadId } from '../../domains/navigation'
import { setArchived } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'
import { desktop } from '../../platform/desktop'
import { WorkspaceSettingsDialog } from '../settings/WorkspaceSettingsDialog'

const SHOWN = 8

/** One workspace's threads, or the threads outside any workspace. */
export function ThreadGroup({ workspace, threads }: { workspace: WorkspaceRow | undefined; threads: ThreadSummary[] }) {
  const [open, setOpen] = useState(true)
  const [all, setAll] = useState(false)
  const [settings, setSettings] = useState(false)
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
          {threads.length > SHOWN && (
            <li>
              <button type="button" onClick={() => setAll(!all)} className="flex h-7 items-center pl-8 text-small text-fg-subtle hover:text-fg-muted">
                {all ? m.showLess : m.showMore(threads.length - SHOWN)}
              </button>
            </li>
          )}
        </ul>
      )}
      {workspace && settings && <WorkspaceSettingsDialog workspace={workspace} onClose={() => setSettings(false)} />}
    </section>
  )
}

function ThreadEntry({ thread }: { thread: ThreadSummary }) {
  const active = useOpenThreadId() === thread.id
  const m = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <li>
      <button
        type="button"
        onClick={() => void openThread(thread.id)}
        className={cn(
          'flex h-7 w-full items-center gap-2 rounded-md pr-2 pl-8 text-left text-ui transition-colors duration-100 ease-standard',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          active ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{threadTitle(m, thread)}</span>
        {needsUser(thread.status) ? (
          <span className="size-1.5 shrink-0 rounded-full bg-accent" title={m.shell.sidebar.waiting} />
        ) : isWorking(thread.status) ? (
          <Spinner size={14} className="shrink-0 text-fg-subtle" />
        ) : (
          <span className="shrink-0 text-small font-normal text-fg-subtle tabular-nums">{relativeTime(m, locale, thread.updatedAt)}</span>
        )}
      </button>
    </li>
  )
}
