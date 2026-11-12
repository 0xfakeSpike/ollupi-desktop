// What a turn made or changed, as files you can open: shown under the
// answer once the turn is over, so the result comes before the work behind
// it (PRODUCT.md, principle 0). A file inside the thread's workspace opens
// in the Files panel from its card; Open hands it to the app the system
// opens it with.

import { Button } from '@ollupi/ui'
import { FileText } from 'lucide-react'
import { useContext } from 'react'
import { workspacePath } from '../../domains/filePaths'
import { openPath } from '../../domains/files'
import { showFile } from '../../domains/navigation'
import { useWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { ThreadWorkspace } from '../common/FileLink'

/** Cards beyond this fold into a count; the steps list every file. */
const SHOWN = 3

export function ResultFiles({ paths }: { paths: string[] }) {
  const workspace = useWorkspace(useContext(ThreadWorkspace))
  const t = useT().conversation.results
  if (paths.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {paths.slice(0, SHOWN).map((path) => {
        // ollupi names a file inside the workspace relative to its root.
        const full = path.startsWith('/') || !workspace ? path : `${workspace.rootPath}/${path}`
        const inside = workspace ? workspacePath(full, workspace.rootPath) : undefined
        const slash = full.lastIndexOf('/')
        const name = full.slice(slash + 1)
        const folder = slash > 0 ? full.slice(full.lastIndexOf('/', slash - 1) + 1, slash) : ''
        return (
          <div key={path} className="flex w-full max-w-110 items-center gap-3 rounded-3xl bg-surface py-2.5 pr-2.5 pl-2.5">
            <button
              type="button"
              disabled={!inside}
              onClick={() => workspace && inside && showFile(workspace.id, inside)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-canvas text-fg-muted">
                <FileText size={18} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui font-semibold text-fg">{name}</span>
                {folder && <span className="truncate text-small text-fg-subtle">{t.inFolder(folder)}</span>}
              </span>
            </button>
            <Button size="sm" className="bg-canvas" onClick={() => void openPath(full)}>
              {t.open}
            </Button>
          </div>
        )
      })}
      {paths.length > SHOWN && <span className="pl-3 text-small text-fg-subtle">{t.more(paths.length - SHOWN)}</span>}
    </div>
  )
}
