// What differs from the last commit in the workspace, beside the
// conversation: each changed file with its line counts, and its diff in the
// list's place. It reads again when a turn starts or ends, and on reload.

import type { WorkspaceRow } from '@ollupi/protocol'
import { IconButton, Spinner } from '@ollupi/ui'
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Changes, FileChange, FileDiff } from '../../../../shared/ipc'
import { readChanges, readDiff } from '../../domains/changes'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { CodeBlock } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function ChangesPanel({ workspace, turn }: { workspace: WorkspaceRow; /** The running turn, if any. */ turn: string | undefined }) {
  const t = useT().conversation.changes
  const root = workspace.rootPath
  const [changes, setChanges] = useState<Changes>()
  const [open, setOpen] = useState<FileChange>()
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    void readChanges(root).then((c) => live && c && setChanges(c))
    return () => {
      live = false
    }
  }, [root, turn, version])

  return (
    <SidePanel
      panel="changes"
      wide
      title={t.title}
      closeLabel={t.close}
      actions={
        <IconButton label={t.reload} size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RotateCw size={14} />
        </IconButton>
      }
    >
      {!changes ? (
        <div className="flex justify-center py-8 text-fg-subtle">
          <Spinner />
        </div>
      ) : !changes.repo ? (
        <p className="text-small text-fg-subtle">{t.notRepo}</p>
      ) : open ? (
        <Diff root={root} file={open} version={`${turn}:${version}`} onBack={() => setOpen(undefined)} />
      ) : changes.files.length === 0 ? (
        <p className="text-small text-fg-subtle">{t.none}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg-muted">{t.summary(changes.files.length)}</p>
          <ul className="flex flex-col">
            {changes.files.map((f) => (
              <li key={f.path}>
                <FileRow file={f} onOpen={() => setOpen(f)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SidePanel>
  )
}

function FileRow({ file, onOpen }: { file: FileChange; onOpen(): void }) {
  const t = useT().conversation.changes
  const slash = file.path.lastIndexOf('/')
  return (
    <button
      type="button"
      title={file.path}
      onClick={onOpen}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={file.kind === 'deleted' ? 'shrink-0 text-fg-subtle line-through' : 'shrink-0 text-fg'}>{file.path.slice(slash + 1)}</span>
        {slash > 0 && <span className="truncate text-small text-fg-subtle">{file.path.slice(0, slash)}</span>}
      </span>
      {file.added !== undefined && (
        <span className="shrink-0 font-mono text-small tabular-nums">
          {file.added > 0 && <span className="text-success">+{file.added}</span>}
          {file.removed! > 0 && <span className="ml-1 text-danger">−{file.removed}</span>}
        </span>
      )}
      <span className="w-12 shrink-0 text-right text-small text-fg-subtle">{t.kinds[file.kind]}</span>
    </button>
  )
}

function Diff({ root, file, version, onBack }: { root: string; file: FileChange; version: string; onBack(): void }) {
  const t = useT().conversation.changes
  const [diff, setDiff] = useState<FileDiff>()
  useEffect(() => {
    let live = true
    void readDiff(root, file.path, file.kind === 'untracked').then((d) => live && d && setDiff(d))
    return () => {
      live = false
    }
  }, [root, file, version])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <IconButton label={t.back} size="sm" className="-ml-1" onClick={onBack}>
          <ArrowLeft size={14} />
        </IconButton>
        <span className="selectable min-w-0 flex-1 truncate font-mono text-small text-fg-muted" title={file.path}>
          {file.path}
        </span>
        {file.kind !== 'deleted' && (
          <IconButton label={t.open} size="sm" onClick={() => void desktop.openPath(`${root}/${file.path}`)}>
            <ExternalLink size={14} />
          </IconButton>
        )}
      </div>
      {!diff ? (
        <div className="flex justify-center py-8 text-fg-subtle">
          <Spinner />
        </div>
      ) : (
        <>
          <CodeBlock code={diff.text} label="diff" />
          {diff.truncated && <p className="text-small text-fg-subtle">{t.truncated}</p>}
        </>
      )}
    </div>
  )
}
