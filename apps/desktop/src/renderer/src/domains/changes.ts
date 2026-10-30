// A workspace's uncommitted changes, read from git through the main process
// for the changes panel, and the git actions the panel takes on them.

import type { Changes, Commit, FileChange, FileDiff } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

export function readChanges(root: string): Promise<Changes | undefined> {
  return run((e) => e.changes.list, () => desktop.changes.list(root))
}

export function readDiff(root: string, path: string, untracked: boolean): Promise<FileDiff | undefined> {
  return run((e) => e.changes.diff, () => desktop.changes.diff(root, path, untracked))
}

export function stageFiles(root: string, paths: string[]): Promise<boolean> {
  return run((e) => e.changes.stage, () => desktop.changes.stage(root, paths)).then((r) => r !== undefined)
}

export function unstageFiles(root: string, paths: string[]): Promise<boolean> {
  return run((e) => e.changes.unstage, () => desktop.changes.unstage(root, paths)).then((r) => r !== undefined)
}

export function discardFile(root: string, file: FileChange): Promise<boolean> {
  return run((e) => e.changes.discard, () => desktop.changes.discard(root, file)).then((r) => r !== undefined)
}

export function commitStaged(root: string, message: string): Promise<Commit | undefined> {
  return run((e) => e.changes.commit, () => desktop.changes.commit(root, message))
}
