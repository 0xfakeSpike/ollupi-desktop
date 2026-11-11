// The workspace's files beside the conversation, read-only: a tree that
// reads each folder when it opens, and a file's preview in its place. The
// preview's path leads back: each folder in it lists its files to jump to,
// and a double-click returns to that folder in the tree. The agent changes
// files as it works, so reloading reads every open folder again.

import type { WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, PixelLoader } from '@ollupi/ui'
import { ChevronRight, Code, Eye, File, Folder, FolderOpen, RotateCw } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { FileEntry, FilePreview } from '../../../../shared/ipc'
import { fileMenu, readFolder, readPreview, revealPath } from '../../domains/files'
import { showFile, useNavigation } from '../../domains/navigation'
import { useLocale, useT } from '../../i18n'
import { fileSize } from '../../i18n/format'
import { CodeBlock, CopyButton, Markdown } from '../common/Markdown'
import { SidePanel, usePanelWidths } from './SidePanel'

export function FilesPanel({ workspace }: { workspace: WorkspaceRow }) {
  const t = useT().conversation.files
  const root = workspace.rootPath
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // Kept with navigation, so a path in the conversation can open its file here.
  const file = useNavigation((s) => (s.file?.workspaceId === workspace.id ? s.file.path : undefined))
  const setFile = (path: string | undefined) => showFile(workspace.id, path)
  // Bumped by reload: every open folder and the open file read again.
  const [version, setVersion] = useState(0)
  // A folder the tree scrolls to once its row is drawn, after the path led back to it.
  const [revealed, setRevealed] = useState<string>()
  // Markdown shows rendered until asked for its source, and stays so from file to file.
  const [source, setSource] = useState(false)
  const toggle = (path: string) => setExpanded((s) => flip(s, path))
  const reveal = (folder: string) => {
    setExpanded((s) => {
      const next = new Set(s)
      const parts = folder ? folder.split('/') : []
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')))
      return next
    })
    setRevealed(folder || undefined)
    setFile(undefined)
  }

  return (
    <SidePanel
      panel="files"
      width="wide"
      title={workspace.name}
      closeLabel={t.close}
      actions={
        <IconButton label={t.reload} size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RotateCw size={14} />
        </IconButton>
      }
    >
      {file === undefined ? (
        <Entries
          root={root}
          path=""
          depth={0}
          expanded={expanded}
          version={version}
          onToggle={toggle}
          onOpen={setFile}
          revealed={revealed}
          onRevealed={() => setRevealed(undefined)}
        />
      ) : (
        <Preview
          key={file}
          root={root}
          name={workspace.name}
          path={file}
          version={version}
          source={source}
          onSource={setSource}
          onOpen={setFile}
          onReveal={reveal}
        />
      )}
    </SidePanel>
  )
}

const join = (path: string, name: string) => (path ? `${path}/${name}` : name)

/** The set with path added, or taken out if it was there. */
function flip(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(path)) next.add(path)
  return next
}

function Entries({
  root,
  path,
  depth,
  expanded,
  version,
  onToggle,
  onOpen,
  revealed,
  onRevealed,
}: {
  root: string
  path: string
  depth: number
  expanded: ReadonlySet<string>
  version: number
  onToggle(path: string): void
  onOpen(path: string): void
  revealed?: string
  onRevealed?(): void
}) {
  const t = useT().conversation.files
  const [entries, setEntries] = useState<FileEntry[]>()
  useEffect(() => {
    let live = true
    void readFolder(root, path).then((e) => live && e && setEntries(e))
    return () => {
      live = false
    }
  }, [root, path, version])

  if (!entries) {
    return depth === 0 ? (
      <div className="flex justify-center py-8">
        <PixelLoader label={t.loadingFolder} />
      </div>
    ) : null
  }
  if (depth === 0 && entries.length === 0) return <p className="text-small text-fg-subtle">{t.empty}</p>
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} className="flex flex-col">
      {entries.map((e) => {
        const p = join(path, e.name)
        const open = e.kind === 'folder' && expanded.has(p)
        return (
          <li key={e.name} role="treeitem" aria-expanded={e.kind === 'folder' ? open : undefined}>
            <button
              type="button"
              title={p}
              ref={
                p === revealed
                  ? (el) => {
                      if (!el) return
                      el.scrollIntoView({ block: 'center' })
                      el.focus({ preventScroll: true })
                      onRevealed?.()
                    }
                  : undefined
              }
              onClick={() => (e.kind === 'folder' ? onToggle(p) : onOpen(p))}
              onContextMenu={(ev) => {
                ev.preventDefault()
                void fileMenu(`${root}/${p}`, { reveal: t.reveal })
              }}
              // Each level indents by the chevron's width, so names line up under their folder's.
              style={{ paddingLeft: 4 + depth * 16 }}
              className="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-ui text-fg transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
            >
              <ChevronRight
                size={14}
                aria-hidden
                className={cn('shrink-0 text-fg-subtle transition duration-160 ease-standard', e.kind === 'file' && 'invisible', open && 'rotate-90')}
              />
              {e.kind === 'folder' ? <Folder size={14} className="shrink-0 text-fg-muted" /> : <File size={14} className="shrink-0 text-fg-subtle" />}
              <span className="ml-1 truncate">{e.name}</span>
            </button>
            {open && (
              <Entries
                root={root}
                path={p}
                depth={depth + 1}
                expanded={expanded}
                version={version}
                onToggle={onToggle}
                onOpen={onOpen}
                revealed={revealed}
                onRevealed={onRevealed}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Shiki's language for a file: its extension, or a name like Dockerfile. */
function languageOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : name
}

const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path)

function Preview({
  root,
  name,
  path,
  version,
  source,
  onSource,
  onOpen,
  onReveal,
}: {
  root: string
  name: string
  path: string
  version: number
  source: boolean
  onSource(source: boolean): void
  onOpen(path: string): void
  onReveal(folder: string): void
}) {
  const t = useT().conversation.files
  const locale = useLocale((s) => s.locale)
  const [file, setFile] = useState<FilePreview>()
  useEffect(() => {
    let live = true
    void readPreview(root, path).then((f) => live && f && setFile(f))
    return () => {
      live = false
    }
  }, [root, path, version])
  const markdown = isMarkdown(path)
  const rendered = markdown && !source

  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex items-start gap-1">
        <Crumbs root={root} name={name} path={path} version={version} onOpen={onOpen} onReveal={onReveal} />
        {markdown && (
          <IconButton label={rendered ? t.showSource : t.showRendered} size="sm" onClick={() => onSource(rendered)}>
            {rendered ? <Code size={14} /> : <Eye size={14} />}
          </IconButton>
        )}
        <CopyButton text={`${root}/${path}`} label={t.copyPath} />
        <IconButton label={t.reveal} size="sm" onClick={() => void revealPath(`${root}/${path}`)}>
          <FolderOpen size={14} />
        </IconButton>
      </div>
      {!file ? (
        <div className="flex justify-center py-8">
          <PixelLoader label={t.loadingFile} />
        </div>
      ) : file.kind === 'text' ? (
        <>
          {rendered ? <Markdown text={file.text} /> : <CodeBlock code={file.text} label={languageOf(path)} />}
          {file.truncated && <p className="text-small text-fg-subtle">{t.truncated(fileSize(locale, file.size))}</p>}
        </>
      ) : file.kind === 'image' ? (
        <img src={file.dataUrl} alt={path} className="max-w-full self-start rounded-md border border-line" />
      ) : file.kind === 'pdf' ? (
        <Pdf data={file.data} title={path} />
      ) : (
        <p className="text-small text-fg-subtle">{t.binary(fileSize(locale, file.size))}</p>
      )}
    </div>
  )
}

/** A PDF in Chromium's viewer, with its pages, zoom and search, filling
 * the panel below the path. */
function Pdf({ data, title }: { data: Uint8Array<ArrayBuffer>; title: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [data])
  // The viewer would take the pointer from an edge being dragged across it.
  const resizing = usePanelWidths((s) => s.resizing)
  return url ? (
    <iframe src={url} title={title} className={cn('min-h-96 w-full flex-1 rounded-md border border-line', resizing && 'pointer-events-none')} />
  ) : null
}

/** The open file's path from the workspace down: a folder for each step,
 * then the file's own name, selectable to copy. */
function Crumbs({
  root,
  name,
  path,
  version,
  onOpen,
  onReveal,
}: {
  root: string
  name: string
  path: string
  version: number
  onOpen(path: string): void
  onReveal(folder: string): void
}) {
  const t = useT().conversation.files
  const parts = path.split('/')
  const file = parts.pop()!
  const folders = ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))]
  return (
    <nav aria-label={t.path} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 font-mono text-small">
      {folders.map((folder, i) => (
        <Fragment key={folder}>
          <FolderCrumb root={root} folder={folder} label={i === 0 ? name : parts[i - 1]!} version={version} onOpen={onOpen} onReveal={onReveal} />
          <span aria-hidden className="text-fg-subtle">
            /
          </span>
        </Fragment>
      ))}
      <span aria-current="page" className="selectable min-w-0 px-1 leading-6 break-all text-fg">
        {file}
      </span>
    </nav>
  )
}

/** One folder of the path. A click lists its files beside it, to open
 * another; a double-click goes back to it in the tree, as does the list's
 * first item for the keyboard. */
function FolderCrumb({
  root,
  folder,
  label,
  version,
  onOpen,
  onReveal,
}: {
  root: string
  folder: string
  label: string
  version: number
  onOpen(path: string): void
  onReveal(folder: string): void
}) {
  const t = useT().conversation.files
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const anchor = `--crumb-${id.replace(/[^\w-]/g, '')}`
  // The list reads its folder only while it shows.
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // A double-click's second click has already shut the list.
  const leave = (then: () => void) => {
    if (menu.current?.matches(':popover-open')) menu.current.hidePopover()
    then()
  }
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        title={t.folderHint}
        aria-expanded={open}
        onDoubleClick={() => leave(() => onReveal(folder))}
        style={{ anchorName: anchor } as CSSProperties}
        className={cn(
          'h-6 max-w-full truncate rounded px-1 text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          open && 'bg-hover text-fg',
        )}
      >
        {label}
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        onToggle={(e) => setOpen(e.newState === 'open')}
        // Under its folder, or wherever the window leaves room.
        style={
          {
            positionAnchor: anchor,
            inset: 'auto',
            top: 'anchor(bottom)',
            left: 'anchor(left)',
            positionTryFallbacks: 'flip-block, flip-inline',
          } as CSSProperties
        }
        className="m-0 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-line bg-raised p-1 font-sans text-fg shadow-lg"
      >
        <button
          type="button"
          onClick={() => leave(() => onReveal(folder))}
          className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-ui text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          <Folder size={14} className="shrink-0" />
          {t.showInList}
        </button>
        <div className="my-1 border-t border-line" />
        {open && (
          <Entries
            root={root}
            path={folder}
            depth={0}
            expanded={expanded}
            version={version}
            onToggle={(p) => setExpanded((s) => flip(s, p))}
            onOpen={(p) => leave(() => onOpen(p))}
          />
        )}
      </div>
    </>
  )
}
