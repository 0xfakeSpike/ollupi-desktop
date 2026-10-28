import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listFolder, readFile, TEXT_LIMIT } from './files'

let root: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ws-'))
  outside = await mkdtemp(join(tmpdir(), 'outside-'))
  await mkdir(join(root, 'src'))
  await mkdir(join(root, '.git'))
  await writeFile(join(root, 'src', 'a.ts'), 'export {}\n')
  await writeFile(join(root, 'file10.txt'), 'ten')
  await writeFile(join(root, 'file2.txt'), 'two')
  await writeFile(join(root, '.DS_Store'), '')
  await writeFile(join(outside, 'secret'), 'no')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('listFolder', () => {
  it('lists folders first, in name order, without git and Finder data', async () => {
    expect(await listFolder(root, '')).toEqual([
      { name: 'src', kind: 'folder' },
      { name: 'file2.txt', kind: 'file' },
      { name: 'file10.txt', kind: 'file' },
    ])
    expect(await listFolder(root, 'src')).toEqual([{ name: 'a.ts', kind: 'file' }])
  })

  it('shows a symlink as what it points to and leaves out a broken one', async () => {
    await symlink(join(root, 'src'), join(root, 'link'))
    await symlink(join(root, 'gone'), join(root, 'broken'))
    expect((await listFolder(root, '')).map((e) => [e.name, e.kind])).toEqual([
      ['link', 'folder'],
      ['src', 'folder'],
      ['file2.txt', 'file'],
      ['file10.txt', 'file'],
    ])
  })

  it('reads nothing outside the workspace', async () => {
    await expect(listFolder(root, '..')).rejects.toThrow('outside the workspace')
    await symlink(outside, join(root, 'away'))
    await expect(listFolder(root, 'away')).rejects.toThrow('outside the workspace')
    await expect(readFile(root, 'away/secret')).rejects.toThrow('outside the workspace')
  })
})

describe('readFile', () => {
  it('reads text, and only the start of a long file', async () => {
    expect(await readFile(root, 'src/a.ts')).toEqual({ kind: 'text', size: 10, text: 'export {}\n', truncated: false })
    await writeFile(join(root, 'long.txt'), 'x'.repeat(TEXT_LIMIT + 5))
    const long = await readFile(root, 'long.txt')
    expect(long.kind === 'text' && [long.text.length, long.truncated]).toEqual([TEXT_LIMIT, true])
  })

  it('tells binary files and images apart from text', async () => {
    await writeFile(join(root, 'data.bin'), Buffer.from([1, 0, 2]))
    expect(await readFile(root, 'data.bin')).toEqual({ kind: 'binary', size: 3 })
    await writeFile(join(root, 'dot.png'), Buffer.from([137, 80, 78, 71]))
    expect(await readFile(root, 'dot.png')).toEqual({ kind: 'image', size: 4, dataUrl: 'data:image/png;base64,iVBORw==' })
  })
})
