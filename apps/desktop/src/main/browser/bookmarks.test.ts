import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Bookmarks, chromeBookmarks } from './bookmarks'

describe('bookmarks', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-bookmarks-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("reads each Chrome profile's pages with their folders, by the profile's name", async () => {
    const chrome = join(dir, 'Chrome')
    await mkdir(join(chrome, 'Default'), { recursive: true })
    await mkdir(join(chrome, 'Profile 1'), { recursive: true })
    await writeFile(join(chrome, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' }, 'Profile 1': { name: 'Empty' } } } }))
    await writeFile(
      join(chrome, 'Default', 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Bookmarks bar',
            children: [
              { type: 'url', name: 'Docs', url: 'https://docs.example.com/' },
              { type: 'folder', name: 'Tools', children: [{ type: 'url', name: '', url: 'https://tool.example.com/' }] },
              { type: 'url', name: 'A script', url: 'javascript:alert(1)' },
            ],
          },
          other: { type: 'folder', name: 'Other', children: [] },
        },
      }),
    )
    await writeFile(join(chrome, 'Profile 1', 'Bookmarks'), JSON.stringify({ roots: {} }))

    expect(await chromeBookmarks(chrome)).toEqual([
      {
        profile: 'Work',
        bookmarks: [
          { url: 'https://docs.example.com/', title: 'Docs', folder: 'Bookmarks bar' },
          { url: 'https://tool.example.com/', title: 'https://tool.example.com/', folder: 'Bookmarks bar / Tools' },
        ],
      },
    ])
    expect(await chromeBookmarks(join(dir, 'no-chrome'))).toEqual([])
  })

  it('refuses a change rather than replace a file it cannot read', async () => {
    const file = join(dir, 'bookmarks.json')
    await writeFile(file, '[{"url":"https://a.exam')
    await expect(new Bookmarks(file, join(dir, 'no-chrome')).add('https://b.example/', 'B')).rejects.toThrow('does not hold JSON')
    expect(await readFile(file, 'utf8')).toBe('[{"url":"https://a.exam')
  })

  it('keeps the newest first, once per page, in its file', async () => {
    const file = join(dir, 'bookmarks.json')
    const b = new Bookmarks(file, join(dir, 'no-chrome'))
    await Promise.all([b.add('https://a.example/', 'A'), b.add('https://b.example/', 'B')])
    expect(await b.add('https://a.example/', 'A again')).toEqual([
      { url: 'https://a.example/', title: 'A again' },
      { url: 'https://b.example/', title: 'B' },
    ])
    expect(await b.remove('https://b.example/')).toEqual([{ url: 'https://a.example/', title: 'A again' }])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([{ url: 'https://a.example/', title: 'A again' }])
    expect((await b.list()).own).toEqual([{ url: 'https://a.example/', title: 'A again' }])
  })
})
