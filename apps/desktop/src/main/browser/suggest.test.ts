import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { History } from './history'
import { bare, suggest, type Visit } from './suggest'

const NOW = Date.UTC(2026, 10, 2)
const DAY = 86_400_000
const visit = (url: string, title: string, visits: number, daysAgo: number): Visit => ({ url, title, visits, last: NOW - daysAgo * DAY })

describe('suggest', () => {
  const visited = [
    visit('https://mail.google.com/mail/u/0/', 'Inbox', 40, 0),
    visit('https://www.github.com/', 'GitHub', 3, 1),
    visit('https://github.com/0xfakeSpike/ollupi', 'ollupi', 9, 0),
    visit('https://digit.example/', 'Digits', 50, 0),
    visit('https://news.example/old', 'GitHub news', 30, 200),
  ]

  it('puts addresses that begin with what is typed first, then word starts, then the rest', () => {
    expect(suggest('git', visited, [], NOW).items.map((p) => p.url)).toEqual([
      'https://github.com/0xfakeSpike/ollupi',
      'https://www.github.com/',
      'https://news.example/old',
      'https://digit.example/',
    ])
  })

  it('completes to the site while what is typed is within its name, then to the page', () => {
    expect(suggest('git', visited, [], NOW).inline).toEqual({ text: 'github.com', url: 'https://github.com/' })
    expect(suggest('github.com/0x', visited, [], NOW).inline).toEqual({ text: 'github.com/0xfakeSpike/ollupi', url: 'https://github.com/0xfakeSpike/ollupi' })
    expect(suggest('inbox', visited, [], NOW).inline).toBeUndefined()
    expect(suggest('https://git', visited, [], NOW).inline).toBeUndefined()
  })

  it('needs every word, in the address or the title', () => {
    expect(suggest('mail inbox', visited, [], NOW).items.map((p) => p.url)).toEqual(['https://mail.google.com/mail/u/0/'])
    expect(suggest('   ', visited, [], NOW).items).toEqual([])
  })

  it('offers bookmarks, marked, and counts a bookmark toward a visited page', () => {
    const bookmarks = [
      { url: 'https://docs.example.com/', title: 'Docs' },
      { url: 'https://www.github.com/', title: 'GitHub home' },
    ]
    const found = suggest('doc', visited, bookmarks, NOW)
    expect(found.items).toEqual([{ url: 'https://docs.example.com/', title: 'Docs', bookmarked: true }])
    expect(found.inline).toEqual({ text: 'docs.example.com', url: 'https://docs.example.com/' })
    expect(suggest('github', visited, bookmarks, NOW).items[1]).toEqual({ url: 'https://www.github.com/', title: 'GitHub', bookmarked: true })
  })

  it('writes addresses as people do', () => {
    expect(bare('https://www.example.com/')).toBe('example.com')
    expect(bare('http://localhost:5173/a/')).toBe('localhost:5173/a/')
  })
})

describe('history', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-history-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('keeps each page once, with its visits, latest title and last visit, in its file', async () => {
    const file = join(dir, 'history.json')
    const h = new History(file)
    await h.visit('https://a.example/', '', 1)
    await h.title('https://a.example/', 'A')
    await h.visit('https://b.example/', 'B', 2)
    await h.visit('https://a.example/', '', 3)
    await h.visit('file:///etc/hosts', '', 4)
    await h.flush()
    const saved = [
      { url: 'https://b.example/', title: 'B', visits: 1, last: 2 },
      { url: 'https://a.example/', title: 'A', visits: 2, last: 3 },
    ]
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(saved)
    expect(await new History(file).entries()).toEqual(saved)

    await h.clear()
    expect(await h.count()).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([])
  })
})
