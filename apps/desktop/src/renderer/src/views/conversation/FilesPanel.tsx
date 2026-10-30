// The workspace's files beside the conversation, read-only: a tree that
// reads each folder when it opens, and a file's preview in its place. The
// agent changes files as it works, so reloading reads every open folder
// again.

import type { WorkspaceRow } from '@ollupi/protocol'
import { cn, IconButton, Spinner } from '@ollupi/ui'
import { ArrowLeft, ChevronRight, ExternalLink, File, Folder, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FileEntry, FilePreview } from '../../../../shared/ipc'
import { readFolder, readPreview } from '../../domains/files'
import { showFile, useNavigation } from '../../domains/navigation'
import { useLocale, useT } from '../../i18n'
import { fileSize } from '../../i18n/format'
import { desktop } from '../../platform/desktop'
import { CodeBlock } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function FilesPanel({ workspace }: { workspace: WorkspaceRow }) {
  const t = useT().conversation.files
  const root = workspace.rootPath
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // Kept with navigation, so a path in the conversation can open its file here.
  const file = useNavigation((s) => (s.file?.workspaceId === workspace.id ? s.file.path : undefined))
  const setFile = (path: string | undefined) => showFile(workspace.id, path)
  // Bumped by reload: every open folder and the open file read again.
  const [version, setVersion] = useState(0)
  const toggle = (path: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (!next.delete(path)) next.add(path)
      return next
    })

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
        <Entries root={root} path="" depth={0} expanded={expanded} version={version} onToggle={toggle} onOpen={setFile} />
      ) : (
        <Preview root={root} path={file} version={version} onBack={() => setFile(undefined)} />
      )}
    </SidePanel>
  )
}

const join = (path: string, name: string) => (path ? `${path}/${name}` : name)

function Entries({
  root,
  path,
  depth,
  expanded,
  version,
  onToggle,
  onOpen,
}: {
  root: string
  path: string
  depth: number
  expanded: ReadonlySet<string>
  version: number
  onToggle(path: string): void
  onOpen(path: string): void
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
      <div className="flex justify-center py-8 text-fg-subtle">
        <Spinner />
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
              onClick={() => (e.kind === 'folder' ? onToggle(p) : onOpen(p))}
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
            {open && <Entries root={root} path={p} depth={depth + 1} expanded={expanded} version={version} onToggle={onToggle} onOpen={onOpen} />}
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

function Preview({ root, path, version, onBack }: { root: string; path: string; version: number; onBack(): void }) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <IconButton label={t.back} size="sm" className="-ml-1" onClick={onBack}>
          <ArrowLeft size={14} />
        </IconButton>
        <span className="selectable min-w-0 flex-1 truncate font-mono text-small text-fg-muted" title={path}>
          {path}
        </span>
        <IconButton label={t.open} size="sm" onClick={() => void desktop.openPath(`${root}/${path}`)}>
          <ExternalLink size={14} />
        </IconButton>
      </div>
      {!file ? (
        <div className="flex justify-center py-8 text-fg-subtle">
          <Spinner />
        </div>
      ) : file.kind === 'text' ? (
        <>
          <CodeBlock code={file.text} label={languageOf(path)} />
          {file.truncated && <p className="text-small text-fg-subtle">{t.truncated(fileSize(locale, file.size))}</p>}
        </>
      ) : file.kind === 'image' ? (
        <img src={file.dataUrl} alt={path} className="max-w-full self-start rounded-md border border-line" />
      ) : (
        <p className="text-small text-fg-subtle">{t.binary(fileSize(locale, file.size))}</p>
      )}
    </div>
  )
}
