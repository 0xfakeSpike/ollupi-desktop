import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceChanges } from './changes'

let repo: string
const changes = new WorkspaceChanges({ env: async () => process.env })
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'repo-'))
  git('init', '-q')
  await mkdir(join(repo, 'app'))
  await writeFile(join(repo, 'app', 'kept.txt'), 'one\ntwo\n')
  await writeFile(join(repo, 'app', 'gone.txt'), 'bye\n')
  await writeFile(join(repo, 'top.txt'), 'top\n')
  git('add', '.')
  git('commit', '-qm', 'start')
})

afterEach(() => rm(repo, { recursive: true, force: true }))

describe('WorkspaceChanges', () => {
  it('lists what differs from the last commit, staged or not, with line counts', async () => {
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n2\n3\n')
    await unlink(join(repo, 'app', 'gone.txt'))
    await writeFile(join(repo, 'app', 'staged.txt'), 'new\n')
    git('add', 'app/staged.txt')
    await writeFile(join(repo, 'app', 'loose 1.txt'), 'x\n')
    const list = await changes.list(repo)
    expect(list.repo && [...list.files].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'app/gone.txt', kind: 'deleted', added: 0, removed: 1 },
      { path: 'app/kept.txt', kind: 'modified', added: 2, removed: 1 },
      { path: 'app/loose 1.txt', kind: 'untracked' },
      { path: 'app/staged.txt', kind: 'added', added: 1, removed: 0 },
    ])
  })

  it('keeps to the workspace when it is a folder inside the repository', async () => {
    await writeFile(join(repo, 'top.txt'), 'changed\n')
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n')
    expect(await changes.list(join(repo, 'app'))).toEqual({ repo: true, files: [{ path: 'kept.txt', kind: 'modified', added: 0, removed: 1 }] })
    const diff = await changes.diff(join(repo, 'app'), 'kept.txt', false)
    expect(diff.text).toContain('-two')
  })

  it('diffs a tracked file against the commit and an untracked one as new', async () => {
    await writeFile(join(repo, 'top.txt'), 'top\nmore\n')
    expect((await changes.diff(repo, 'top.txt', false)).text).toContain('+more')
    await writeFile(join(repo, 'fresh.txt'), 'hello\n')
    expect((await changes.diff(repo, 'fresh.txt', true)).text).toContain('+hello')
    await expect(changes.diff(repo, '../outside', true)).rejects.toThrow()
  })

  it('compares a repository without commits with nothing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'empty-'))
    execFileSync('git', ['init', '-q'], { cwd: empty })
    await writeFile(join(empty, 'a.txt'), 'a\n')
    execFileSync('git', ['add', 'a.txt'], { cwd: empty })
    expect(await changes.list(empty)).toEqual({ repo: true, files: [{ path: 'a.txt', kind: 'added', added: 1, removed: 0 }] })
    await rm(empty, { recursive: true, force: true })
  })

  it('says when the workspace is not in a repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'plain-'))
    expect(await changes.list(plain)).toEqual({ repo: false })
    await rm(plain, { recursive: true, force: true })
  })
})
