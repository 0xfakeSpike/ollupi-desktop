// A workspace's files, read through the main process for the files panel.

import type { FileEntry, FilePreview } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

export function readFolder(root: string, path: string): Promise<FileEntry[] | undefined> {
  return run((e) => e.files.list, () => desktop.files.list(root, path))
}

export function readPreview(root: string, path: string): Promise<FilePreview | undefined> {
  return run((e) => e.files.read, () => desktop.files.read(root, path))
}
