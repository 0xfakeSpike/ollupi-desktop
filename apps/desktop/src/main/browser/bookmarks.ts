// The browser's bookmarks: the person's own, kept in the app's data folder,
// and, to open but never change, those of each Chrome profile on this Mac,
// read from Chrome's Bookmarks file as it is whenever they are listed.
// Chrome's file is plain JSON; Chrome keeps writing it, so it is only read.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Bookmark, BookmarkList, ChromeBookmarks } from '../../shared/ipc'
import { isWebPage } from './address'
import { readKept, writeKept } from './file'

export class Bookmarks {
  /** Changes in the order they were asked for, each on the last's file. */
  private queue: Promise<unknown> = Promise.resolve()

  /** file: the person's bookmarks; chrome: Chrome's user data folder. */
  constructor(
    private readonly file: string,
    private readonly chrome: string,
  ) {}

  async list(): Promise<BookmarkList> {
    return { own: await this.own(), chrome: await chromeBookmarks(this.chrome) }
  }

  /** Newest first; a page already kept moves to the top with its new title. */
  add(url: string, title: string): Promise<Bookmark[]> {
    return this.change((list) => [{ url, title: title || url }, ...list.filter((b) => b.url !== url)])
  }

  remove(url: string): Promise<Bookmark[]> {
    return this.change((list) => list.filter((b) => b.url !== url))
  }

  private change(fn: (list: Bookmark[]) => Bookmark[]): Promise<Bookmark[]> {
    const next = this.queue.then(async () => {
      const list = fn(await this.own())
      await writeKept(this.file, JSON.stringify(list, null, 2))
      return list
    })
    this.queue = next.catch(() => {})
    return next
  }

  private async own(): Promise<Bookmark[]> {
    const saved = await readKept(this.file)
    if (!Array.isArray(saved)) return []
    return saved.filter((b): b is Bookmark => typeof b?.url === 'string' && typeof b?.title === 'string')
  }
}

interface ChromeNode {
  type?: string
  name?: string
  url?: string
  children?: ChromeNode[]
}

/** Each Chrome profile's bookmarks, in Chrome's order, named as Chrome
 * names the profile; profiles without bookmarks are left out. */
export async function chromeBookmarks(chrome: string): Promise<ChromeBookmarks[]> {
  const state = (await readJson(join(chrome, 'Local State'))) as { profile?: { info_cache?: Record<string, { name?: string }> } } | undefined
  const profiles = Object.entries(state?.profile?.info_cache ?? {})
  const out: ChromeBookmarks[] = []
  for (const [dir, info] of profiles) {
    const file = (await readJson(join(chrome, dir, 'Bookmarks'))) as { roots?: Record<string, ChromeNode> } | undefined
    const bookmarks: ChromeBookmarks['bookmarks'] = []
    const walk = (node: ChromeNode, folder: string[]) => {
      if (node.type === 'url' && node.url && isWebPage(node.url)) bookmarks.push({ url: node.url, title: node.name || node.url, folder: folder.join(' / ') })
      for (const child of node.children ?? []) walk(child, node.type === 'folder' && node.name ? [...folder, node.name] : folder)
    }
    for (const root of Object.values(file?.roots ?? {})) if (root && typeof root === 'object') walk(root, [])
    if (bookmarks.length) out.push({ profile: info.name || dir, bookmarks })
  }
  return out
}

/** A JSON file's value; undefined when it is missing or unreadable. */
async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}
