import { isWorking, needsUser, relativeTime, threadTitle } from '@ollupi/core'
import type { ThreadSummary, WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { Archive, ChevronRight, Folder, FolderOpen, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { openThread } from '../../domains/conversation'
import { go, useOpenThreadId } from '../../domains/navigation'
import { setArchived } from '../../domains/workspaces'
import { desktop } from '../../platform/desktop'
import { WorkspaceSettingsDialog } from '../settings/WorkspaceSettingsDialog'

const SHOWN = 8

/** One workspace's threads, or the threads outside any workspace. */
export function ThreadGroup({ workspace, threads }: { workspace: WorkspaceRow | undefined; threads: ThreadSummary[] }) {
  const [open, setOpen] = useState(true)
  const [all, setAll] = useState(false)
  const [settings, setSettings] = useState(false)
  if (!workspace && threads.length === 0) return null
  const visible = all ? threads : threads.slice(0, SHOWN)

  return (
    <section className="mt-3">
      <div className="group flex h-7 items-center gap-1 pr-1 pl-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={workspace?.rootPath}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-medium text-fg-subtle hover:text-fg-muted"
        >
          <ChevronRight size={12} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
          {workspace && <Folder size={13} className="shrink-0" />}
          <span className="truncate">{workspace ? workspace.name : 'Threads'}</span>
        </button>
        {workspace && (
          <div className="flex opacity-0 transition group-hover:opacity-100">
            <IconButton label="Reveal folder" size="sm" onClick={() => void desktop.openPath(workspace.rootPath)}>
              <FolderOpen size={13} />
            </IconButton>
            <IconButton label="Workspace settings" size="sm" onClick={() => setSettings(true)}>
              <Settings2 size={13} />
            </IconButton>
            <IconButton label={`Archive ${workspace.name}`} size="sm" onClick={() => void setArchived(workspace.id, true)}>
              <Archive size={13} />
            </IconButton>
            <IconButton label={`New thread in ${workspace.name}`} size="sm" onClick={() => go({ kind: 'draft', workspaceId: workspace.id })}>
              <Plus size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-px">
          {visible.map((t) => (
            <ThreadEntry key={t.id} thread={t} />
          ))}
          {workspace && threads.length === 0 && <li className="py-1 pl-8 text-[12px] text-fg-subtle">No threads yet</li>}
          {threads.length > SHOWN && (
            <li>
              <button type="button" onClick={() => setAll(!all)} className="py-1 pl-8 text-[12px] text-fg-subtle hover:text-fg-muted">
                {all ? 'Show less' : `Show ${threads.length - SHOWN} more`}
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
        {needsUser(thread.status) ? (
          <span className="size-2 shrink-0 rounded-full bg-warning" title="Waiting for you" />
        ) : isWorking(thread.status) ? (
          <Spinner size={12} className="shrink-0 text-fg-subtle" />
        ) : (
          <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(thread.updatedAt)}</span>
        )}
      </button>
    </li>
  )
}
