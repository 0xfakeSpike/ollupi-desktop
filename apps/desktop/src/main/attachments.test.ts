import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TempAttachments } from './attachments'

let root: string
let temps: TempAttachments

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'attachments-'))
  temps = new TempAttachments(join(root, 'attachments'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

describe('TempAttachments', () => {
  it('writes a file under its own name and removes it', async () => {
    const path = await temps.write('screenshot.png', new Uint8Array([1, 2, 3]))
    expect(basename(path)).toBe('screenshot.png')
    expect([...(await readFile(path))]).toEqual([1, 2, 3])
    await temps.remove(path)
    expect(existsSync(path)).toBe(false)
  })

  it('keeps a name from leaving its folder', async () => {
    const path = await temps.write('../../escape.png', new Uint8Array([1]))
    expect(path.startsWith(join(root, 'attachments'))).toBe(true)
    expect(basename(path)).toBe('escape.png')
  })

  it('refuses to remove anything it did not write', async () => {
    const other = join(root, 'other.txt')
    await writeFile(other, 'keep')
    await expect(temps.remove(other)).rejects.toThrow()
    await expect(temps.remove(join(root, 'attachments', '..', 'x', 'other.txt'))).rejects.toThrow()
    expect(existsSync(other)).toBe(true)
  })
})
