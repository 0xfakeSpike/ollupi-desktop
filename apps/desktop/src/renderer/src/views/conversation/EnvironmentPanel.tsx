// What changed where the conversation works, beside it. It leads with how
// many files changed since the last commit, in words, then each changed file
// with its line counts, and its diff in the list's place; where it runs (the
// environment, the folder, the git branch) is one line that opens into the
// details (PRODUCT.md principle 0). It reads again when a turn starts or ends,
// after each git action, and on reload. Files are staged with their
// checkbox, discarded after asking, and what is staged is committed with a
// message.

import type { EnvironmentRow, WorkspaceRow } from '@ollupi/protocol'
import { Button, Details, IconButton, Loader, Textarea } from '@ollupi/ui'
import { ArrowLeft, Cloud, ExternalLink, Folder, GitBranch, GitCommitHorizontal, Laptop, RotateCw, Undo2, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Changes, FileChange, FileDiff, Head } from '../../../../shared/ipc'
import { commitStaged, discardFile, readChanges, readDiff, stageFiles, unstageFiles } from '../../domains/changes'
import { openPath } from '../../domains/files'
import { notify } from '../../domains/notices'
import { useT } from '../../i18n'
import { CodeBlock } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function EnvironmentPanel({
  workspace,
  environment,
  turn,
}: {
  workspace: WorkspaceRow
  /** Where the conversation's commands run; for a draft, where they would. */
  environment: EnvironmentRow | undefined
  /** The running turn, if any. */
  turn: string | undefined
}) {
  const panel = useT().conversation.environment
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
      panel="environment"
      width="wide"
      title={panel.title}
      closeLabel={panel.close}
      bare
      actions={
        <IconButton label={t.reload} size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RotateCw size={14} />
        </IconButton>
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* A diff is read at length: it takes the whole panel. */}
        {!changes ? (
          <div className="flex justify-center py-8">
            <Loader label={t.loading} />
          </div>
        ) : open ? (
          <Diff root={root} file={open} version={`${turn}:${version}`} onBack={() => setOpen(undefined)} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-display text-fg">{!changes.repo ? t.noHistory : files.length === 0 ? t.none : t.headline(files.length)}</h3>
              <p className="text-ui text-fg-muted">{!changes.repo ? t.notRepo : files.length === 0 ? t.noneHint : t.headlineHint}</p>
            </div>
            <Where environment={environment} root={root} head={changes.repo ? changes.head : undefined} />
            {files.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-end">
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
        )}
      </div>
      {!open && changes?.repo && files.length > 0 && <CommitForm root={root} staged={staged.length} onCommitted={() => setVersion((v) => v + 1)} />}
    </SidePanel>
  )
}

/** Where it runs, as one line ("On this computer, in ollupi-desktop"), that
 * opens into the environment, the full folder path and, in a repository,
 * where HEAD is. */
function Where({ environment, root, head }: { environment: EnvironmentRow | undefined; root: string; head: Head | undefined }) {
  const m = useT()
  const t = m.conversation.environment
  const cloud = environment?.kind === 'machine'
  // The local environment is named by the app, in the person's language.
  const place = cloud ? (environment?.name ?? '—') : t.here
  const folder = root.slice(root.lastIndexOf('/') + 1) || root
  return (
    <Details summary={<span className="text-small text-fg-muted">{t.where(place, folder)}</span>}>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        <Row icon={cloud ? Cloud : Laptop} label={t.environment}>
          <span className="truncate">{place}</span>
          {cloud && <span className="shrink-0 text-small text-fg-subtle">{m.conversation.environments.machine}</span>}
        </Row>
        <Row icon={Folder} label={t.folder}>
          <button
            type="button"
            title={t.openFolder}
            onClick={() => void openPath(root)}
            className="selectable min-w-0 truncate rounded-sm text-left font-mono text-small text-fg hover:underline focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
          >
            {root}
          </button>
        </Row>
        {head && (
          <Row icon={GitBranch} label={t.branch}>
            {'branch' in head ? (
              <span className="selectable truncate font-mono text-small">{head.branch}</span>
            ) : (
              <span className="truncate text-small text-fg-muted">{t.detached(head.detached)}</span>
            )}
          </Row>
        )}
      </dl>
    </Details>
  )
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2 text-ui">
      <dt className="flex w-24 shrink-0 items-center gap-1.5 text-small text-fg-subtle">
        <Icon size={14} className="shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-baseline gap-2 text-fg">{children}</dd>
    </div>
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
    <div className="mx-3 mb-3 flex shrink-0 flex-col gap-2 rounded-3xl bg-surface p-3">
      <Textarea
        rows={2}
        value={message}
        aria-label={t.message}
        placeholder={t.message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey && staged > 0 && message.trim() && !committing) void commit()
        }}
        className="resize-none bg-canvas text-ui"
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
    <div className="group flex h-8 items-center gap-1 rounded-full pl-3 transition-colors duration-100 ease-standard hover:bg-hover">
      <input
        type="checkbox"
        aria-label={t.stage(file.path)}
        title={file.staged === 'part' ? t.partlyStaged : undefined}
        checked={file.staged !== 'none'}
        ref={(el) => {
          if (el) el.indeterminate = file.staged === 'part'
        }}
        onChange={(e) => onStage(file.staged === 'part' ? true : e.target.checked)}
        className="size-3.5 shrink-0 accent-ink focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      />
      <button
        type="button"
        title={file.path}
        onClick={onOpen}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-1 text-left text-ui focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
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
          <IconButton label={t.open} size="sm" onClick={() => void openPath(`${root}/${file.path}`)}>
            <ExternalLink size={14} />
          </IconButton>
        )}
      </div>
      {!diff ? (
        <div className="flex justify-center py-8">
          <Loader label={t.loadingDiff} />
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
