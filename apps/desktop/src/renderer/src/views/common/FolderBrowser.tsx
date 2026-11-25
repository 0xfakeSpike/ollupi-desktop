// The folders of an environment's machine, to choose a workspace's among:
// read through ollupi, as the machine may be another than the window's, a
// cloud sandbox's or a server's. It opens in the environment's own folder;
// the path above leads back up, a folder in the list leads in, and a new
// folder can be made where it stands.

import { Button, cn, IconButton, Input, Loader } from '@ollupi/ui'
import { ChevronRight, CornerLeftUp, Folder, FolderPlus } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { listFolders, makeFolder, type FolderList } from '../../domains/workspaces'
import { useT } from '../../i18n'

export function FolderBrowser({ environmentId, onAt }: { environmentId: string | undefined; onAt(path: string | undefined): void }) {
  const t = useT().workspaces.browser
  const [path, setPath] = useState<string>()
  const [folder, setFolder] = useState<FolderList>()
  const [failed, setFailed] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  // A new environment starts again in its own folder.
  useEffect(() => setPath(undefined), [environmentId])
  useEffect(() => {
    let live = true
    setFailed(false)
    void listFolders(environmentId, path).then((f) => {
      if (!live) return
      if (!f) return setFailed(true)
      setFolder(f)
      onAt(f.path)
    })
    return () => {
      live = false
    }
  }, [environmentId, path])

  const make = async () => {
    const made = folder && name.trim() ? await makeFolder(environmentId, folder.path, name.trim()) : undefined
    if (!made) return
    setNaming(false)
    setName('')
    setPath(made)
  }

  if (!folder) {
    return failed ? (
      <p className="text-small text-fg-muted">{t.unreadable}</p>
    ) : (
      <div className="flex justify-center py-8">
        <Loader label={t.loading} />
      </div>
    )
  }
  const parts = folder.path.split('/').filter(Boolean)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-1">
        <nav aria-label={t.path} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 font-mono text-small">
          <Crumb label="/" onClick={() => setPath('/')} current={parts.length === 0} />
          {parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <span aria-hidden className="text-fg-subtle">
                  /
                </span>
              )}
              <Crumb label={part} current={i === parts.length - 1} onClick={() => setPath(`/${parts.slice(0, i + 1).join('/')}`)} />
            </Fragment>
          ))}
        </nav>
        {folder.parent && (
          <IconButton label={t.up} size="sm" onClick={() => setPath(folder.parent)}>
            <CornerLeftUp size={14} />
          </IconButton>
        )}
        <IconButton label={t.newFolder} size="sm" active={naming} onClick={() => setNaming((n) => !n)}>
          <FolderPlus size={14} />
        </IconButton>
      </div>
      {naming && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={name}
            placeholder={t.folderName}
            className="flex-1"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void make()}
          />
          <Button size="sm" disabled={!name.trim()} onClick={() => void make()}>
            {t.make}
          </Button>
        </div>
      )}
      <ul className="flex max-h-72 min-h-40 flex-col overflow-y-auto rounded-2xl bg-surface p-1">
        {folder.folders.length === 0 && <li className="px-3 py-2 text-small text-fg-subtle">{t.empty}</li>}
        {folder.folders.map((f) => (
          <li key={f}>
            <button
              type="button"
              onClick={() => setPath(folder.path === '/' ? `/${f}` : `${folder.path}/${f}`)}
              className="flex h-8 w-full items-center gap-2 rounded-full px-3 text-left text-ui text-fg transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
            >
              <Folder size={14} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate">{f}</span>
              <ChevronRight size={14} className="shrink-0 text-fg-subtle" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Crumb({ label, current, onClick }: { label: string; current: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      aria-current={current ? 'location' : undefined}
      onClick={onClick}
      className={cn(
        'h-6 max-w-full truncate rounded px-1 transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        current ? 'text-fg' : 'text-fg-muted',
      )}
    >
      {label}
    </button>
  )
}
