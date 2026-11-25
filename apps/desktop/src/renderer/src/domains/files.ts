// A workspace's files as the Files panel shows them, read where the
// workspace is, through ollupi: the window may run on another machine than
// the workspace. Paths are relative to the workspace root.

import type { FileEntryRow, FilePreviewRow } from '@ollupi/protocol'
import { gateway } from '../gateway/connection'
import { gatewayFetch, gatewayPath } from '../gateway/http'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

/** Opens a path of this Mac (the app's own data and logs) in the app the
 * system gives it. */
export function openPath(path: string): Promise<void | undefined> {
  return run((e) => e.files.open, () => desktop.openPath(path))
}

export function readFolder(workspaceId: string, path: string): Promise<FileEntryRow[] | undefined> {
  return run((e) => e.files.list, async () => (await gateway().call('workspace/listFiles', { workspaceId, path })).data)
}

/** A file as the preview shows it: the start of its text, or an image or a
 * PDF read whole, or none of these. */
export type FilePreview =
  | { kind: 'text'; size: number; text: string; truncated: boolean }
  | { kind: 'image'; size: number; url: string }
  | { kind: 'pdf'; size: number; data: Uint8Array<ArrayBuffer> }
  | { kind: 'binary'; size: number }

export function readPreview(workspaceId: string, path: string): Promise<FilePreview | undefined> {
  return run((e) => e.files.read, async () => {
    const f = await gateway().call('workspace/readFile', { workspaceId, path })
    return previewOf(workspaceId, path, f)
  })
}

async function previewOf(workspaceId: string, path: string, f: FilePreviewRow): Promise<FilePreview> {
  switch (f.kind) {
    case 'text':
      return { kind: 'text', size: f.size, text: f.text ?? '', truncated: !!f.truncated }
    case 'image':
      return { kind: 'image', size: f.size, url: URL.createObjectURL(await readWhole(workspaceId, path)) }
    case 'pdf':
      return { kind: 'pdf', size: f.size, data: new Uint8Array(await (await readWhole(workspaceId, path)).arrayBuffer()) }
  }
  return { kind: 'binary', size: f.size }
}

/** Lets go of what a preview holds: an image's object URL. */
export function releasePreview(f: FilePreview | undefined): void {
  if (f?.kind === 'image') URL.revokeObjectURL(f.url)
}

/** A whole file of the workspace, as the gateway serves an image or PDF. */
async function readWhole(workspaceId: string, path: string): Promise<Blob> {
  return (await gatewayFetch(gatewayPath('workspaceFile', { workspace: workspaceId, path }))).blob()
}

/** An image a Markdown file in the workspace shows, as an object URL, read
 * quietly: one that is missing, too large or not an image is no failure,
 * as a page with a broken image is no error of the app. The caller
 * revokes the URL. */
export async function readImage(workspaceId: string, path: string): Promise<string | undefined> {
  try {
    const f = await gateway().call('workspace/readFile', { workspaceId, path })
    return f.kind === 'image' ? URL.createObjectURL(await readWhole(workspaceId, path)) : undefined
  } catch {
    return undefined
  }
}

const kinds = new Map<string, Promise<FileEntryRow['kind'] | undefined>>()

/** Whether a path a reply names is a file or a folder, asked quietly: a
 * path that is not there is no failure. A found one is remembered for the
 * session, as every message drawn asks again; a missing one is asked anew,
 * as the agent may write it yet. */
export function fileKind(workspaceId: string, path: string): Promise<FileEntryRow['kind'] | undefined> {
  const key = `${workspaceId}\0${path}`
  let kind = kinds.get(key)
  if (!kind) {
    kind = (async () => {
      try {
        return (await gateway().call('workspace/statFile', { workspaceId, path })).kind
      } catch {
        return undefined
      }
    })()
    kinds.set(key, kind)
    void kind.then((k) => k || kinds.delete(key))
  }
  return kind
}
