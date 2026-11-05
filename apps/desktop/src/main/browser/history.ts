// The pages the browser has opened, by the person or an agent, kept in the
// app's data folder for the address bar to offer again. Each page is kept
// once: how often it was opened, when last, and under its latest title. The
// oldest go once there are too many; changes reach the file a moment after,
// several at once.

import { isWebPage } from './address'
import { readKept, writeKept } from './file'
import type { Visit } from './suggest'

const LIMIT = 5000
const SAVE_DELAY = 1000

export class History {
  /** By address, the least recently opened first. */
  private pages: Promise<Map<string, Visit>> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  /** Writes in the order they were asked for. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  /** A page opened: title is '' when the page has not named itself yet. */
  async visit(url: string, title: string, now = Date.now()): Promise<void> {
    if (!isWebPage(url)) return
    const pages = await this.load()
    const kept = pages.get(url)
    pages.delete(url)
    pages.set(url, { url, title: title || kept?.title || '', visits: (kept?.visits ?? 0) + 1, last: now })
    for (const old of pages.keys()) {
      if (pages.size <= LIMIT) break
      pages.delete(old)
    }
    this.later()
  }

  /** A page named itself after it opened. */
  async title(url: string, title: string): Promise<void> {
    const page = (await this.load()).get(url)
    if (!page || !title || page.title === title) return
    page.title = title
    this.later()
  }

  async entries(): Promise<Visit[]> {
    return [...(await this.load()).values()]
  }

  async count(): Promise<number> {
    return (await this.load()).size
  }

  async clear(): Promise<void> {
    ;(await this.load()).clear()
    await this.write()
  }

  /** Writes what is waiting to be, if anything is. */
  flush(): Promise<void> {
    return this.timer ? this.write() : this.queue.then(() => {})
  }

  private async write(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    const list = [...(await this.load()).values()]
    const next = this.queue.then(() => writeKept(this.file, JSON.stringify(list)))
    this.queue = next.catch(() => {})
    return next
  }

  private later(): void {
    if (this.timer) return
    this.timer = setTimeout(() => void this.write().catch((err: unknown) => console.error('browser history not saved', err)), SAVE_DELAY)
  }

  private load(): Promise<Map<string, Visit>> {
    this.pages ??= readKept(this.file).then((saved) => {
      const list = Array.isArray(saved) ? saved.filter(isVisit) : []
      list.sort((a, b) => a.last - b.last)
      return new Map(list.map((v) => [v.url, v]))
    })
    return this.pages
  }
}

function isVisit(v: unknown): v is Visit {
  const p = v as Visit
  return typeof p?.url === 'string' && typeof p.title === 'string' && typeof p.visits === 'number' && typeof p.last === 'number'
}
