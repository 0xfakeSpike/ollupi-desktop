// A workspace's files as the person sees them: a folder's entries and a
// file's contents, read-only. Paths come from the renderer relative to the
// workspace root, and nothing outside the root is read, a symlink's target
// included.

import { open, readdir, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import type { FileEntry, FilePreview } from '../shared/ipc'

/** Git's own data, and Finder's; neither is part of the work. */
const hidden = new Set(['.git', '.DS_Store'])

/** More text than a person reads in a preview. */
export const TEXT_LIMIT = 256 * 1024
const IMAGE_LIMIT = 5 * 1024 * 1024
/** Where a NUL byte marks a file as binary, as git decides. */
const SNIFF = 8000

const images: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/** Folders first, then by name as Finder orders them. */
export async function listFolder(root: string, path: string): Promise<FileEntry[]> {
  const dir = await inside(root, path)
  const entries = await readdir(dir, { withFileTypes: true })
  const out: FileEntry[] = []
  for (const e of entries) {
    if (hidden.has(e.name)) continue
    // A symlink shows as what it points to; one that points nowhere is left out.
    const folder = e.isSymbolicLink() ? await stat(join(dir, e.name)).then((s) => s.isDirectory(), () => undefined) : e.isDirectory()
    if (folder === undefined) continue
    out.push({ name: e.name, kind: folder ? 'folder' : 'file' })
  }
  const order = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return out.sort((a, b) => (a.kind === b.kind ? order.compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1))
}

export async function readFile(root: string, path: string): Promise<FilePreview> {
  const file = await inside(root, path)
  const { size } = await stat(file)
  const mime = images[extname(file).toLowerCase()]
  if (mime) {
    if (size > IMAGE_LIMIT) return { kind: 'binary', size }
    return { kind: 'image', size, dataUrl: `data:${mime};base64,${(await head(file, size)).toString('base64')}` }
  }
  const bytes = await head(file, Math.min(size, TEXT_LIMIT))
  if (bytes.subarray(0, SNIFF).includes(0)) return { kind: 'binary', size }
  return { kind: 'text', size, text: bytes.toString('utf8'), truncated: size > TEXT_LIMIT }
}

/** The real path of root/path, which must stay inside root's real path. */
export async function inside(root: string, path: string): Promise<string> {
  if (!isAbsolute(root) || isAbsolute(path)) throw new Error('expected an absolute root and a relative path')
  const base = await realpath(root)
  const full = await realpath(join(base, path))
  const rel = relative(base, full)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${path} is outside the workspace`)
  return full
}

async function head(file: string, length: number): Promise<Buffer> {
  const handle = await open(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
