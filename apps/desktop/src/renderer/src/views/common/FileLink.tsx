// A workspace file's path wherever the conversation shows one, in a tool's
// output or a reply: a click opens the file in the Files panel. The file is
// where the workspace is, which may be another machine than the window's,
// so it opens nowhere else.

import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { fileKind } from '../../domains/files'
import { workspacePath } from '../../domains/filePaths'
import { showFile } from '../../domains/navigation'
import { useWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'

/** The workspace of the thread on screen, whose files the Files panel shows. */
export const ThreadWorkspace = createContext<string | undefined>(undefined)

/** Opens a path relative to the thread's workspace on a click; undefined
 * outside a thread. rootPath is empty for a scratch workspace, whose folder
 * only its environment names. */
export function useOpenFile(): { workspaceId: string; rootPath: string; open(path: string, event: MouseEvent): void } | undefined {
  const workspace = useWorkspace(useContext(ThreadWorkspace))
  if (!workspace) return undefined
  return {
    workspaceId: workspace.id,
    rootPath: workspace.rootPath,
    open: (path, event) => {
      event.preventDefault()
      showFile(workspace.id, path)
    },
  }
}

/** The workspace file text names, once it is known to be one; undefined
 * for any other text, before then, or outside a thread with a workspace. */
function useNamedFile(text: string | undefined): { path: string; open(path: string, event: MouseEvent): void } | undefined {
  const opener = useOpenFile()
  const path = opener && text !== undefined ? workspacePath(text, opener.rootPath) : undefined
  const [found, setFound] = useState<string>()
  useEffect(() => {
    if (!opener || !path) return setFound(undefined)
    let live = true
    void fileKind(opener.workspaceId, path).then((k) => live && setFound(k === 'file' ? path : undefined))
    return () => {
      live = false
    }
  }, [opener?.workspaceId, path])
  return opener && found && found === path ? { path, open: opener.open } : undefined
}

/** Text in a reply that may name a workspace file, as inline code or a
 * link's target: a link to the file when it is one, else as it was. */
export function ReplyPath({ text, children, fallback }: { text: string | undefined; children: ReactNode; fallback?: ReactNode }) {
  const t = useT().conversation.tool
  const file = useNamedFile(text)
  if (!file) return fallback ?? children
  return (
    <a href={`#${encodeURI(file.path)}`} title={t.openInFiles} onClick={(e) => file.open(file.path, e)}>
      {children}
    </a>
  )
}
