import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Permissions, asking } from './permissions'

describe('permissions', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-permissions-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('asks for the Mac’s own devices every time and refuses what it does not know', () => {
    expect(asking('clipboard-read')).toBe('once')
    expect(asking('notifications')).toBe('once')
    expect(asking('geolocation')).toBe('each')
    expect(asking('media')).toBe('each')
    expect(asking('display-capture')).toBe('each')
    expect(asking('something-new')).toBe('never')
  })

  it('keeps an answer per site and permission, in its file', async () => {
    const file = join(dir, 'browser-permissions.json')
    const p = new Permissions(file)
    expect(await p.answered('a.example', 'clipboard-read')).toBeUndefined()
    await p.answer('a.example', 'clipboard-read', true)
    expect(await p.answered('a.example', 'clipboard-read')).toBe(true)
    expect(await p.answered('a.example', 'notifications')).toBeUndefined()
    expect(await p.answered('b.example', 'clipboard-read')).toBeUndefined()
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ 'a.example': { 'clipboard-read': true } })
    // A new instance reads what the last one wrote.
    expect(await new Permissions(file).answered('a.example', 'clipboard-read')).toBe(true)
  })

  it('answers the last of answers given at once, and keeps the rest', async () => {
    const file = join(dir, 'browser-permissions.json')
    const p = new Permissions(file)
    await Promise.all([p.answer('a.example', 'clipboard-read', true), p.answer('b.example', 'notifications', false)])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      'a.example': { 'clipboard-read': true },
      'b.example': { notifications: false },
    })
  })

  it('leaves out what a file holds besides answers', async () => {
    const file = join(dir, 'browser-permissions.json')
    await writeFile(
      file,
      JSON.stringify({
        'a.example': { 'clipboard-read': true, notifications: 'yes', 'media': null },
        'b.example': 'all',
        'c.example': { geolocation: false },
      }),
    )
    const p = new Permissions(file)
    expect(await p.answered('a.example', 'clipboard-read')).toBe(true)
    expect(await p.answered('a.example', 'notifications')).toBeUndefined()
    expect(await p.answered('a.example', 'media')).toBeUndefined()
    expect(await p.answered('b.example', 'clipboard-read')).toBeUndefined()
    expect(await p.answered('c.example', 'geolocation')).toBe(false)
  })

  it('holds no answers for a file that is not there, and refuses one that is not JSON', async () => {
    expect(await new Permissions(join(dir, 'missing.json')).answered('a.example', 'clipboard-read')).toBeUndefined()
    const file = join(dir, 'browser-permissions.json')
    await writeFile(file, '{"a.example":')
    // Not taken as empty: the next answer would replace what it holds.
    await expect(new Permissions(file).answer('a.example', 'clipboard-read', true)).rejects.toThrow('does not hold JSON')
    expect(await readFile(file, 'utf8')).toBe('{"a.example":')
  })
})
