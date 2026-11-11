// A workspace's files, read through the main process for the files panel.

import type { FileEntry, FilePreview } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

/** Opens a path in the app the system gives it. */
export function openPath(path: string): Promise<void | undefined> {
  return run((e) => e.files.open, () => desktop.openPath(path))
}

/** Shows a file or folder in Finder, selected. */
export function revealPath(path: string): Promise<void | undefined> {
  return run((e) => e.files.reveal, () => desktop.revealFile(path))
}

/** The menu a file or folder row opens on a right-click. */
export async function fileMenu(path: string, labels: { reveal: string }): Promise<void> {
  if ((await desktop.contextMenu([{ id: 'reveal', label: labels.reveal }])) === 'reveal') await revealPath(path)
}

export function readFolder(root: string, path: string): Promise<FileEntry[] | undefined> {
  return run((e) => e.files.list, () => desktop.files.list(root, path))
}

export function readPreview(root: string, path: string): Promise<FilePreview | undefined> {
  return run((e) => e.files.read, () => desktop.files.read(root, path))
}

const kinds = new Map<string, Promise<FileEntry['kind'] | undefined>>()

/** Whether a path a reply names is a file or a folder, asked quietly: a
 * path that is not there is no failure. A found one is remembered for the
 * session, as every message drawn asks again; a missing one is asked anew,
 * as the agent may write it yet. */
export function fileKind(root: string, path: string): Promise<FileEntry['kind'] | undefined> {
  const key = `${root}\0${path}`
  let kind = kinds.get(key)
  if (!kind) {
    kind = desktop.files.kind(root, path).catch(() => undefined)
    kinds.set(key, kind)
    void kind.then((k) => k || kinds.delete(key))
  }
  return kind
}
