// What the address bar offers for what is typed: the pages visited and
// bookmarked whose address or title holds every word typed. Those whose
// address begins with what is typed come first, then those with a word that
// begins with each word typed, then the rest; within each, the pages opened
// most and most lately, a bookmark counting as one more. When the first
// page's address begins with what is typed, the bar completes it: to the
// site alone while what is typed is still within its name.

import type { Bookmark, Suggestions } from '../../shared/ipc'

/** A page the browser opened: how often, and when last. */
export interface Visit {
  url: string
  title: string
  visits: number
  last: number
}

const LIMIT = 8
const DAY = 86_400_000

interface Page extends Visit {
  bookmarked: boolean
}

export function suggest(query: string, visited: Visit[], bookmarks: Bookmark[], now = Date.now()): Suggestions {
  const typed = query.trim().toLowerCase()
  if (!typed) return { query, items: [] }
  const words = typed.split(/\s+/)
  const start = bare(typed)

  const pages = new Map<string, Page>()
  for (const v of visited) pages.set(v.url, { ...v, bookmarked: false })
  for (const b of bookmarks) {
    const page = pages.get(b.url)
    if (page) {
      page.bookmarked = true
      page.title ||= b.title
    } else pages.set(b.url, { url: b.url, title: b.title, visits: 0, last: 0, bookmarked: true })
  }

  const ranked: { page: Page; tier: number; score: number }[] = []
  for (const page of pages.values()) {
    const address = bare(page.url).toLowerCase()
    const title = page.title.toLowerCase()
    if (!words.every((w) => address.includes(w) || title.includes(w))) continue
    const tier = address.startsWith(start) ? 2 : words.every((w) => beginsWord(address, w) || beginsWord(title, w)) ? 1 : 0
    ranked.push({ page, tier, score: page.visits * recency(now - page.last) + (page.bookmarked ? 1 : 0) })
  }
  ranked.sort((a, b) => b.tier - a.tier || b.score - a.score || b.page.last - a.page.last)

  const items = ranked.slice(0, LIMIT).map(({ page }) => ({ url: page.url, title: page.title, bookmarked: page.bookmarked }))
  const top = ranked[0]
  return { query, items, inline: top?.tier === 2 ? completion(top.page.url, typed) : undefined }
}

/** The first page's address as the bar completes what is typed, and the
 * page that opens; none unless it begins with exactly what is typed. */
function completion(url: string, typed: string): Suggestions['inline'] {
  const address = bare(url)
  const site = address.split('/')[0]!
  if (typed.length <= site.length && site.toLowerCase().startsWith(typed)) return { text: site, url: `${new URL(url).origin}/` }
  if (address.toLowerCase().startsWith(typed)) return { text: address, url }
  return undefined
}

/** An address as people write it: no scheme, no www., no lone slash. */
export function bare(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^([^/?#]*)\/$/, '$1')
}

/** Whether a word of s begins with w: at its start, or after anything that
 * is not a letter or digit. */
function beginsWord(s: string, w: string): boolean {
  for (let i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(s[i - 1]!)) return true
  }
  return false
}

/** How much a page's visits count by how long ago it was last opened. */
function recency(age: number): number {
  if (age < 4 * DAY) return 1
  if (age < 14 * DAY) return 0.7
  if (age < 31 * DAY) return 0.5
  if (age < 90 * DAY) return 0.3
  return 0.1
}
