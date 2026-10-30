import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceChanges } from './changes'

let repo: string
const trashed: string[] = []
const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const changes = new WorkspaceChanges({
  env: async () => ({ ...process.env, ...identity }),
  trash: async (path) => {
    trashed.push(path)
    await rm(path)
  },
})
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
      { path: 'app/gone.txt', kind: 'deleted', staged: 'none', added: 0, removed: 1 },
      { path: 'app/kept.txt', kind: 'modified', staged: 'none', added: 2, removed: 1 },
      { path: 'app/loose 1.txt', kind: 'untracked', staged: 'none' },
      { path: 'app/staged.txt', kind: 'added', staged: 'all', added: 1, removed: 0 },
    ])
  })

  it('keeps to the workspace when it is a folder inside the repository', async () => {
    await writeFile(join(repo, 'top.txt'), 'changed\n')
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n')
    expect(await changes.list(join(repo, 'app'))).toEqual({ repo: true, files: [{ path: 'kept.txt', kind: 'modified', staged: 'none', added: 0, removed: 1 }] })
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
    expect(await changes.list(empty)).toEqual({ repo: true, files: [{ path: 'a.txt', kind: 'added', staged: 'all', added: 1, removed: 0 }] })
    await rm(empty, { recursive: true, force: true })
  })

  it('stages and unstages, keeping the working tree, and says when part is staged', async () => {
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n2\n')
    await changes.stage(join(repo, 'app'), ['kept.txt'])
    const staged = async () => {
      const list = await changes.list(repo)
      return list.repo ? list.files.find((f) => f.path === 'app/kept.txt')?.staged : undefined
    }
    expect(await staged()).toBe('all')
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n2\n3\n')
    expect(await staged()).toBe('part')
    await changes.unstage(join(repo, 'app'), ['kept.txt'])
    expect(await staged()).toBe('none')
    await expect(changes.stage(join(repo, 'app'), ['../top.txt'])).rejects.toThrow('not a path in the workspace')
  })

  it('discards back to the commit, and sends what no commit holds to the Trash', async () => {
    await writeFile(join(repo, 'top.txt'), 'changed\n')
    git('add', 'top.txt')
    await changes.discard(repo, { path: 'top.txt', kind: 'modified', staged: 'all' })
    await unlink(join(repo, 'app', 'gone.txt'))
    await changes.discard(repo, { path: 'app/gone.txt', kind: 'deleted', staged: 'none' })
    await writeFile(join(repo, 'new.txt'), 'new\n')
    git('add', 'new.txt')
    await changes.discard(repo, { path: 'new.txt', kind: 'added', staged: 'all' })
    expect(await changes.list(repo)).toEqual({ repo: true, files: [] })
    expect(trashed.at(-1)).toBe(join(repo, 'new.txt'))
  })

  it('commits what is staged', async () => {
    await writeFile(join(repo, 'top.txt'), 'changed\n')
    await writeFile(join(repo, 'app', 'kept.txt'), 'one\n')
    await changes.stage(repo, ['top.txt'])
    const commit = await changes.commit(repo, 'Change the top\n\nOnly the top.')
    expect(commit.subject).toBe('Change the top')
    expect(commit.hash).toMatch(/^[0-9a-f]{7,}$/)
    expect(await changes.list(repo)).toEqual({ repo: true, files: [{ path: 'app/kept.txt', kind: 'modified', staged: 'none', added: 0, removed: 1 }] })
    await expect(changes.commit(repo, '  ')).rejects.toThrow('message')
  })

  it('says when the workspace is not in a repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'plain-'))
    expect(await changes.list(plain)).toEqual({ repo: false })
    await rm(plain, { recursive: true, force: true })
  })
})
