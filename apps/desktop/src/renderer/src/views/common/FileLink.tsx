// A workspace file's path wherever the conversation shows one, in a tool's
// output or a reply: a click opens the file in the Files panel, ⌘-click in
// the app the system opens it with.

import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { fileKind } from '../../domains/files'
import { workspacePath } from '../../domains/filePaths'
import { showFile } from '../../domains/navigation'
import { useWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

/** The workspace of the thread on screen, whose files the Files panel shows. */
export const ThreadWorkspace = createContext<string | undefined>(undefined)

/** Opens a path relative to the thread's workspace on a click; undefined
 * outside a thread with a workspace. */
export function useOpenFile(): { root: string; open(path: string, event: MouseEvent): void } | undefined {
  const workspace = useWorkspace(useContext(ThreadWorkspace))
  if (!workspace) return undefined
  const root = workspace.rootPath
  return {
    root,
    open: (path, event) => {
      event.preventDefault()
      if (event.metaKey) void desktop.openPath(`${root}/${path}`)
      else showFile(workspace.id, path)
    },
  }
}

/** The workspace file text names, once it is known to be one; undefined
 * for any other text, before then, or outside a thread with a workspace. */
function useNamedFile(text: string | undefined): { root: string; path: string; open(path: string, event: MouseEvent): void } | undefined {
  const opener = useOpenFile()
  const path = opener && text !== undefined ? workspacePath(text, opener.root) : undefined
  const [found, setFound] = useState<string>()
  useEffect(() => {
    if (!opener || !path) return setFound(undefined)
    let live = true
    void fileKind(opener.root, path).then((k) => live && setFound(k === 'file' ? path : undefined))
    return () => {
      live = false
    }
  }, [opener?.root, path])
  return opener && found && found === path ? { root: opener.root, path, open: opener.open } : undefined
}

/** Text in a reply that may name a workspace file, as inline code or a
 * link's target: a link to the file when it is one, else as it was. */
export function ReplyPath({ text, children, fallback }: { text: string | undefined; children: ReactNode; fallback?: ReactNode }) {
  const t = useT().conversation.tool
  const file = useNamedFile(text)
  if (!file) return fallback ?? children
  return (
    <a href={`file://${encodeURI(`${file.root}/${file.path}`)}`} title={t.openInFiles} onClick={(e) => file.open(file.path, e)}>
      {children}
    </a>
  )
}
