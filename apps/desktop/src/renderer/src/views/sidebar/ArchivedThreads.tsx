import type { ThreadRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { ArchiveRestore, ChevronRight, MessageSquareOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { openThread } from '../../domains/conversation'
import { useOpenThreadId } from '../../domains/navigation'
import { archiveThread, deleteThread, loadArchivedThreads, useArchivedThreads } from '../../domains/threads'
import { useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'

/** Archived threads of every workspace, read when first opened: they keep
 * their messages but take no new ones, and their scheduled tasks are not
 * sent, until restored. */
export function ArchivedThreads() {
  const [open, setOpen] = useState(false)
  const list = useArchivedThreads((s) => s.list)
  const more = useArchivedThreads((s) => s.more)
  const m = useT().shell.sidebar

  const toggle = () => {
    if (!open && !list) void loadArchivedThreads('start')
    setOpen(!open)
  }

  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex h-7 w-full items-center gap-2 px-2 text-left text-small font-medium text-fg-subtle transition-colors duration-100 ease-standard hover:text-fg-muted"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <MessageSquareOff size={14} />
        </span>
        {list ? m.archivedThreads(more ? `${list.length}+` : String(list.length)) : m.archivedThreadsTitle}
        <ChevronRight size={14} aria-hidden className={cn('shrink-0 opacity-0 transition duration-160 ease-standard group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {!list && (
            <li className="flex h-7 items-center pl-8 text-fg-subtle">
              <Spinner size={14} />
            </li>
          )}
          {list?.length === 0 && <li className="flex h-7 items-center pl-8 text-small text-fg-subtle">{m.noArchivedThreads}</li>}
          {list?.map((t) => <ArchivedThread key={t.id} thread={t} />)}
          {more && (
            <li>
              <button type="button" onClick={() => void loadArchivedThreads('more')} className="flex h-7 items-center pl-8 text-small text-fg-subtle hover:text-fg-muted">
                {m.loadMore}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function ArchivedThread({ thread }: { thread: ThreadRow }) {
  const active = useOpenThreadId() === thread.id
  const workspace = useWorkspaces((s) => s.list.find((w) => w.id === thread.workspaceId))
  const m = useT()
  const s = m.shell.sidebar
  const title = threadTitle(m, thread)
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => void openThread(thread.id)}
        title={workspace?.name ?? s.noWorkspace}
        className={cn(
          'flex h-7 w-full items-center rounded-md pr-14 pl-8 text-left text-ui transition-colors duration-100 ease-standard',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          active ? 'bg-selected font-medium text-fg' : 'text-fg-subtle hover:bg-hover hover:text-fg-muted',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      <div className="absolute inset-y-0 right-0.5 hidden items-center group-focus-within:flex group-hover:flex">
        <IconButton label={s.restoreThread(title)} size="sm" onClick={() => void archiveThread(thread.id, false)}>
          <ArchiveRestore size={13} />
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
