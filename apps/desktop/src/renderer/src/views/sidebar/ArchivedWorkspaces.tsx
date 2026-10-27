import type { WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton } from '@ollupi/ui'
import { Archive, ArchiveRestore, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { setArchived } from '../../domains/workspaces'
import { useT } from '../../i18n'

/** Archived workspaces, hidden with their threads until restored: ollupi
 * starts no new work in them. */
export function ArchivedWorkspaces({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const [open, setOpen] = useState(false)
  const m = useT().shell.sidebar
  if (workspaces.length === 0) return null
  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex h-7 w-full items-center gap-2 px-2 text-left text-small font-medium text-fg-subtle transition-colors duration-100 ease-standard hover:text-fg-muted"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Archive size={14} />
        </span>
        {m.archived(workspaces.length)}
        <ChevronRight size={14} aria-hidden className={cn('shrink-0 opacity-0 transition duration-160 ease-standard group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {workspaces.map((w) => (
            <li key={w.id} className="group flex h-7 items-center gap-2 rounded-md pr-0.5 pl-8 text-ui text-fg-subtle hover:bg-hover">
              <span className="min-w-0 flex-1 truncate" title={w.rootPath}>
                {w.name}
              </span>
              <IconButton label={m.restore(w.name)} size="sm" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={() => void setArchived(w.id, false)}>
                <ArchiveRestore size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
