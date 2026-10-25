import { isBusy, needsAttention, relativeTime, threadTitle } from '@ollupi/core'
import type { ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { newDraft, openThread } from '../../services/actions/threads'
import { desktop } from '../../services/desktop'
import { useActiveThreadId } from '../../stores/navigation'

const COLLAPSED_LIMIT = 8

export function WorkspaceSection({ workspace, threads }: { workspace: WorkspaceRow | undefined; threads: ThreadSummary[] }) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  if (!workspace && threads.length === 0) return null
  const visible = showAll ? threads : threads.slice(0, COLLAPSED_LIMIT)

  return (
    <section className="mt-3">
      <div className="group flex h-7 items-center gap-1 pr-1 pl-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-medium text-fg-subtle hover:text-fg-muted"
          title={workspace?.rootPath}
        >
          <ChevronRight size={12} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
          {workspace ? <Folder size={13} className="shrink-0" /> : null}
          <span className="truncate">{workspace ? workspace.name : 'Threads'}</span>
        </button>
        {workspace && (
          <div className="flex opacity-0 transition group-hover:opacity-100">
            <IconButton label="Reveal folder" size="sm" onClick={() => void desktop.openPath(workspace.rootPath)}>
              <FolderOpen size={13} />
            </IconButton>
            <IconButton label={`New thread in ${workspace.name}`} size="sm" onClick={() => newDraft(workspace.id)}>
              <Plus size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-px">
          {visible.map((t) => (
            <ThreadItem key={t.id} thread={t} />
          ))}
          {workspace && threads.length === 0 && (
            <li className="py-1 pl-8 text-[12px] text-fg-subtle">No threads yet</li>
          )}
          {threads.length > COLLAPSED_LIMIT && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="py-1 pl-8 text-[12px] text-fg-subtle hover:text-fg-muted"
              >
                {showAll ? 'Show less' : `Show ${threads.length - COLLAPSED_LIMIT} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function ThreadItem({ thread }: { thread: ThreadSummary }) {
  const active = useActiveThreadId() === thread.id
  return (
    <li>
      <button
        type="button"
        onClick={() => void openThread(thread.id)}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md pr-2 pl-8 text-left text-[13px] transition',
          active ? 'bg-hover text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{threadTitle(thread)}</span>
        <ThreadStatusMark thread={thread} />
      </button>
    </li>
  )
}

function ThreadStatusMark({ thread }: { thread: ThreadSummary }) {
  if (needsAttention(thread.status)) {
    return <span className="size-2 shrink-0 rounded-full bg-warning" title="Waiting for you" />
  }
  if (isBusy(thread.status)) return <Spinner size={12} className="shrink-0 text-fg-subtle" />
  return <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(thread.updatedAt)}</span>
}
