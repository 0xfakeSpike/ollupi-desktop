// What changed where the conversation works, beside it. It leads with how
// many files changed since the last commit, in words, then each changed file
// with its line counts, and its diff in the list's place; where it runs (the
// environment, the folder, the git branch) is one line that opens into the
// details (PRODUCT.md principle 0). It reads again when a turn starts or ends,
// after each git action, and on reload. Files are staged with their
// checkbox, discarded after asking, and what is staged is committed with a
// message.

import type { ChangesResult, EnvironmentRow, FileChangeRow, FileDiffResult, HeadRow, WorkspaceRow } from '@ollupi/protocol'
import { Button, Details, IconButton, Loader, Textarea } from '@ollupi/ui'
import { ArrowLeft, Cloud, Folder, FolderTree, GitBranch, GitCommitHorizontal, Laptop, RotateCw, Undo2, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { commitStaged, discardFile, readChanges, readDiff, stageFiles, unstageFiles } from '../../domains/changes'
import { environmentName, onThisMachine, providerName, useEnvironments } from '../../domains/environments'
import { showFile } from '../../domains/navigation'
import { notify } from '../../domains/notices'
import { useT } from '../../i18n'
import { workspaceName } from '../../i18n/format'
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
  const id = workspace.id
  const [changes, setChanges] = useState<ChangesResult>()
  const [open, setOpen] = useState<FileChangeRow>()
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    void readChanges(id).then((c) => live && c && setChanges(c))
    return () => {
      live = false
    }
  }, [id, turn, version])

  /** Runs a git action, then reads the changes again. */
  const act = async (action: () => Promise<unknown>) => {
    await action()
    setVersion((v) => v + 1)
  }
  const files = changes?.files ?? []
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
          <Diff workspaceId={id} file={open} version={`${turn}:${version}`} onBack={() => setOpen(undefined)} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-display text-fg">{!changes.repo ? t.noHistory : files.length === 0 ? t.none : t.headline(files.length)}</h3>
              <p className="text-ui text-fg-muted">{!changes.repo ? t.notRepo : files.length === 0 ? t.noneHint : t.headlineHint}</p>
            </div>
            <Where environment={environment} workspace={workspace} head={changes.head ?? undefined} />
            {files.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void act(() => (allStaged ? unstageFiles(id, files.map((f) => f.path)) : stageFiles(id, files.map((f) => f.path))))}
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
                        onStage={(on) => void act(() => (on ? stageFiles(id, [f.path]) : unstageFiles(id, [f.path])))}
                        onDiscard={() => {
                          if (confirm(f.kind === 'untracked' || f.kind === 'added' ? t.discardNewConfirm(f.path) : t.discardConfirm(f.path))) void act(() => discardFile(id, f))
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
      {!open && changes?.repo && files.length > 0 && <CommitForm workspaceId={id} staged={staged.length} onCommitted={() => setVersion((v) => v + 1)} />}
    </SidePanel>
  )
}

/** Where it runs, as one line ("On this computer, in ollupi-desktop"), that
 * opens into the environment, the full folder path (a scratch workspace's
 * is its environment's own) and, in a repository, where HEAD is. */
function Where({ environment, workspace, head }: { environment: EnvironmentRow | undefined; workspace: WorkspaceRow; head: HeadRow | undefined }) {
  const m = useT()
  const t = m.conversation.environment
  const providers = useEnvironments((s) => s.providers)
  const cloud = !!environment && !onThisMachine(environment)
  const place = environment ? environmentName(environment) : t.here
  const root = workspace.rootPath
  const folder = root ? root.slice(root.lastIndexOf('/') + 1) || root : workspaceName(m, workspace)
  return (
    <Details summary={<span className="text-small text-fg-muted">{t.where(place, folder)}</span>}>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        <Row icon={cloud ? Cloud : Laptop} label={t.environment}>
          <span className="truncate">{place}</span>
          {environment && <span className="shrink-0 text-small text-fg-subtle">{providerName(environment.provider, providers)}</span>}
        </Row>
        <Row icon={Folder} label={t.folder}>
          <span className="selectable min-w-0 truncate font-mono text-small text-fg">{root || t.scratchFolder}</span>
        </Row>
        {head && (
          <Row icon={GitBranch} label={t.branch}>
            {head.branch ? (
              <span className="selectable truncate font-mono text-small">{head.branch}</span>
            ) : (
              <span className="truncate text-small text-fg-muted">{t.detached(head.detached ?? '')}</span>
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
function CommitForm({ workspaceId, staged, onCommitted }: { workspaceId: string; staged: number; onCommitted(): void }) {
  const t = useT().conversation.changes
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const commit = async () => {
    setCommitting(true)
    const done = await commitStaged(workspaceId, message.trim())
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

function FileRow({ file, onOpen, onStage, onDiscard }: { file: FileChangeRow; onOpen(): void; onStage(on: boolean): void; onDiscard(): void }) {
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
        {file.added != null && (
          <span className="shrink-0 font-mono text-small tabular-nums">
            {file.added > 0 && <span className="text-success">+{file.added}</span>}
            {(file.removed ?? 0) > 0 && <span className="ml-1 text-danger">−{file.removed}</span>}
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

function Diff({ workspaceId, file, version, onBack }: { workspaceId: string; file: FileChangeRow; version: string; onBack(): void }) {
  const t = useT().conversation.changes
  const [diff, setDiff] = useState<FileDiffResult>()
  useEffect(() => {
    let live = true
    void readDiff(workspaceId, file.path, file.kind === 'untracked').then((d) => live && d && setDiff(d))
    return () => {
      live = false
    }
  }, [workspaceId, file, version])

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
          <IconButton label={t.showInFiles} size="sm" onClick={() => showFile(workspaceId, file.path)}>
            <FolderTree size={14} />
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
