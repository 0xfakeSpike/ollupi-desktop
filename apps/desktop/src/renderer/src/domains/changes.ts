// A workspace's uncommitted changes, read from git where the workspace is,
// through ollupi, for the changes panel, and the git actions the panel
// takes on them: ollupi runs git there as the person.

import type { ChangesResult, CommitResult, FileChangeRow, FileDiffResult } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

export function readChanges(workspaceId: string): Promise<ChangesResult | undefined> {
  return run((e) => e.changes.list, () => gateway().call('workspace/changes', { workspaceId }))
}

export function readDiff(workspaceId: string, path: string, untracked: boolean): Promise<FileDiffResult | undefined> {
  return run((e) => e.changes.diff, () => gateway().call('workspace/diff', { workspaceId, path, untracked }))
}

export function stageFiles(workspaceId: string, paths: string[]): Promise<boolean> {
  return run((e) => e.changes.stage, () => gateway().call('workspace/stage', { workspaceId, paths })).then((r) => r !== undefined)
}

export function unstageFiles(workspaceId: string, paths: string[]): Promise<boolean> {
  return run((e) => e.changes.unstage, () => gateway().call('workspace/unstage', { workspaceId, paths })).then((r) => r !== undefined)
}

/** Puts a file back as the last commit has it; one no commit holds goes to
 * the trash of the workspace's machine. */
export function discardFile(workspaceId: string, file: FileChangeRow): Promise<boolean> {
  return run((e) => e.changes.discard, () => gateway().call('workspace/discard', { workspaceId, path: file.path, kind: file.kind })).then((r) => r !== undefined)
}

export function commitStaged(workspaceId: string, message: string): Promise<CommitResult | undefined> {
  return run((e) => e.changes.commit, () => gateway().call('workspace/commit', { workspaceId, message }))
}
