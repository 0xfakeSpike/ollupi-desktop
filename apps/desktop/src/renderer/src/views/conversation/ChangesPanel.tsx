// What differs from the last commit in the workspace, beside the
// conversation: each changed file with its line counts, and its diff in the
// list's place. It reads again when a turn starts or ends, after each git
// action, and on reload. Files are staged with their checkbox, discarded
// after asking, and what is staged is committed with a message.

import type { WorkspaceRow } from '@ollupi/protocol'
import { Button, IconButton, Spinner, Textarea } from '@ollupi/ui'
import { ArrowLeft, ExternalLink, GitCommitHorizontal, RotateCw, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Changes, FileChange, FileDiff } from '../../../../shared/ipc'
import { commitStaged, discardFile, readChanges, readDiff, stageFiles, unstageFiles } from '../../domains/changes'
import { notify } from '../../domains/notices'
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

  /** Runs a git action, then reads the changes again. */
  const act = async (action: () => Promise<unknown>) => {
    await action()
    setVersion((v) => v + 1)
  }
  const files = changes?.repo ? changes.files : []
  const staged = files.filter((f) => f.staged !== 'none')
  const allStaged = files.length > 0 && files.every((f) => f.staged === 'all')

  return (
    <SidePanel
      panel="changes"
      width="wide"
      title={t.title}
      closeLabel={t.close}
      bare
      actions={
        <IconButton label={t.reload} size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RotateCw size={14} />
        </IconButton>
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!changes ? (
          <div className="flex justify-center py-8 text-fg-subtle">
            <Spinner />
          </div>
        ) : !changes.repo ? (
          <p className="text-small text-fg-subtle">{t.notRepo}</p>
        ) : open ? (
          <Diff root={root} file={open} version={`${turn}:${version}`} onBack={() => setOpen(undefined)} />
        ) : files.length === 0 ? (
          <p className="text-small text-fg-subtle">{t.none}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-small text-fg-muted">{t.summary(files.length)}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void act(() => (allStaged ? unstageFiles(root, files.map((f) => f.path)) : stageFiles(root, files.map((f) => f.path))))}
              >
                {allStaged ? t.unstageAll : t.stageAll}
              </Button>
            </div>
            <ul className="flex flex-col">
              {files.map((f) => (
                <li key={f.path}>
                  <FileRow
                    file={f}
                    onOpen={() => setOpen(f)}
                    onStage={(on) => void act(() => (on ? stageFiles(root, [f.path]) : unstageFiles(root, [f.path])))}
                    onDiscard={() => {
                      if (confirm(f.kind === 'untracked' || f.kind === 'added' ? t.discardNewConfirm(f.path) : t.discardConfirm(f.path))) void act(() => discardFile(root, f))
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!open && changes?.repo && files.length > 0 && <CommitForm root={root} staged={staged.length} onCommitted={() => setVersion((v) => v + 1)} />}
    </SidePanel>
  )
}

/** Commits what is staged; the message's first line is its subject. */
function CommitForm({ root, staged, onCommitted }: { root: string; staged: number; onCommitted(): void }) {
  const t = useT().conversation.changes
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const commit = async () => {
    setCommitting(true)
    const done = await commitStaged(root, message.trim())
    setCommitting(false)
    if (!done) return
    setMessage('')
    notify(t.committed(done.hash, done.subject), 'info')
    onCommitted()
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3">
      <Textarea
        rows={2}
        value={message}
        aria-label={t.message}
        placeholder={t.message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey && staged > 0 && message.trim()) void commit()
        }}
        className="resize-none text-ui"
      />
      <Button variant="primary" icon={<GitCommitHorizontal size={14} />} disabled={staged === 0 || !message.trim()} loading={committing} onClick={() => void commit()}>
        {staged === 0 ? t.nothingStaged : t.commit(staged)}
      </Button>
    </div>
  )
}

function FileRow({ file, onOpen, onStage, onDiscard }: { file: FileChange; onOpen(): void; onStage(on: boolean): void; onDiscard(): void }) {
  const t = useT().conversation.changes
  const slash = file.path.lastIndexOf('/')
  return (
    <div className="group flex h-8 items-center gap-1 rounded-md pl-2 transition-colors duration-100 ease-standard hover:bg-hover">
      <input
        type="checkbox"
        aria-label={t.stage(file.path)}
        title={file.staged === 'part' ? t.partlyStaged : undefined}
        checked={file.staged !== 'none'}
        ref={(el) => {
          if (el) el.indeterminate = file.staged === 'part'
        }}
        onChange={(e) => onStage(file.staged === 'part' ? true : e.target.checked)}
        className="size-3.5 shrink-0 accent-accent focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      />
      <button
        type="button"
        title={file.path}
        onClick={onOpen}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-ui focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
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
      <IconButton label={t.discard} size="sm" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={onDiscard}>
        <Undo2 size={14} />
      </IconButton>
    </div>
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
