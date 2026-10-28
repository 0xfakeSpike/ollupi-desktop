// A workspace's uncommitted changes, read from git through the main process
// for the changes panel.

import type { Changes, FileDiff } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

export function readChanges(root: string): Promise<Changes | undefined> {
  return run((e) => e.changes.list, () => desktop.changes.list(root))
}

export function readDiff(root: string, path: string, untracked: boolean): Promise<FileDiff | undefined> {
  return run((e) => e.changes.diff, () => desktop.changes.diff(root, path, untracked))
}
