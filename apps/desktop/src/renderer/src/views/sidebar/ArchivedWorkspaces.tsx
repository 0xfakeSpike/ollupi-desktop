import type { WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton } from '@ollupi/ui'
import { ArchiveRestore, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { setArchived } from '../../domains/workspaces'

/** Archived workspaces, hidden with their threads until restored: ollupi
 * starts no new work in them. */
export function ArchivedWorkspaces({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const [open, setOpen] = useState(false)
  if (workspaces.length === 0) return null
  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full items-center gap-1.5 pl-2 text-[12px] font-medium text-fg-subtle hover:text-fg-muted"
      >
        <ChevronRight size={12} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        Archived · {workspaces.length}
      </button>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-px">
          {workspaces.map((w) => (
            <li key={w.id} className="group flex h-8 items-center gap-2 rounded-md pr-1 pl-8 text-[13px] text-fg-subtle hover:bg-hover">
              <span className="min-w-0 flex-1 truncate" title={w.rootPath}>
                {w.name}
              </span>
              <IconButton label={`Restore ${w.name}`} size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => void setArchived(w.id, false)}>
                <ArchiveRestore size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
