// A workspace's uncommitted changes as git sees them: every file under the
// workspace that differs from the last commit, the index and the working
// tree together, and each one's diff; and what the person does with them:
// stage, unstage, discard, commit. ollupi changes files only through
// commands and records no edits of its own, so the repository is where a
// turn's work shows. Renames show as a deletion and an addition, as they do
// to git without rename detection.

import { execFile } from 'node:child_process'
import { isAbsolute, join, normalize, sep } from 'node:path'
import type { Changes, Commit, FileChange, FileDiff } from '../shared/ipc'
import { inside } from './files'

/** More diff than a person reads in a panel. */
export const DIFF_LIMIT = 512 * 1024

/** What a repository without commits is compared with. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export interface ChangesOptions {
  env(): Promise<NodeJS.ProcessEnv>
  /** Moves a file to the Trash. */
  trash(path: string): Promise<void>
}

export class WorkspaceChanges {
  constructor(private readonly opts: ChangesOptions) {}

  async list(root: string): Promise<Changes> {
    const repo = await this.repo(root)
    if (!repo) return { repo: false }
    const status = await this.git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', '.'])
    const counts = await this.git(root, ['diff', repo.base, '--numstat', '-z', '--no-renames', '--', '.'])
    const lines = new Map<string, { added: number; removed: number }>()
    for (const entry of counts.split('\0')) {
      const [added, removed, path] = entry.split('\t')
      // A binary file's counts are '-'.
      if (path && added !== '-') lines.set(path, { added: Number(added), removed: Number(removed) })
    }
    const files: FileChange[] = []
    for (const entry of status.split('\0')) {
      if (entry.length < 4) continue
      const path = entry.slice(3)
      const xy = entry.slice(0, 2)
      const kind = kindOf(xy)
      if (kind) files.push({ path: path.slice(repo.prefix.length), kind, staged: stagedOf(xy), ...lines.get(path) })
    }
    return { repo: true, files }
  }

  /** path is relative to the workspace root, as list gives it. */
  async diff(root: string, path: string, untracked: boolean): Promise<FileDiff> {
    const repo = await this.repo(root)
    if (!repo) throw new Error(`${root} is not in a git repository`)
    // git reads only inside the repository; an untracked file is read
    // outside git's index, so it must be inside the workspace.
    const text = untracked
      ? (await inside(root, path), await this.git(root, ['diff', '--no-index', '--no-color', '--', '/dev/null', path], [0, 1]))
      : await this.git(root, ['diff', repo.base, '--no-color', '--no-renames', '--', `:(literal)${path}`])
    return text.length > DIFF_LIMIT ? { text: text.slice(0, DIFF_LIMIT), truncated: true } : { text, truncated: false }
  }

  /** Stages the files' changes, deletions included. */
  async stage(root: string, paths: string[]): Promise<void> {
    await this.repo(root, true)
    await this.git(root, ['add', '-A', '--', ...paths.map(literal)])
  }

  /** Takes the files' changes out of the index, keeping them in the working
   * tree. Before the first commit nothing is in HEAD to go back to, so the
   * files leave the index. */
  async unstage(root: string, paths: string[]): Promise<void> {
    const repo = await this.repo(root, true)
    const args = repo.head ? ['restore', '--staged', '--'] : ['rm', '--cached', '-q', '-r', '--']
    await this.git(root, [...args, ...paths.map(literal)])
  }

  /** Puts a file back as the last commit has it, in the index and the
   * working tree. A file no commit holds has nothing to go back to: it
   * leaves the index and goes to the Trash, where it can still be found. */
  async discard(root: string, file: FileChange): Promise<void> {
    await this.repo(root, true)
    const path = literal(file.path)
    if (file.kind === 'modified' || file.kind === 'deleted') {
      await this.git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', path])
      return
    }
    if (file.kind === 'added') await this.git(root, ['rm', '--cached', '-q', '--', path])
    await this.opts.trash(join(root, normalize(file.path)))
  }

  /** Commits what is staged with the message, as the person's git
   * identity, hooks included. */
  async commit(root: string, message: string): Promise<Commit> {
    await this.repo(root, true)
    if (!message.trim()) throw new Error('a commit needs a message')
    await this.git(root, ['commit', '-q', '-m', message])
    const [hash = '', subject = ''] = (await this.git(root, ['log', '-1', '--format=%h%x00%s'])).trim().split('\0')
    return { hash, subject }
  }

  /** The workspace's path inside its repository, and what it is compared
   * with; undefined outside a repository. */
  private async repo(root: string): Promise<Repo | undefined>
  private async repo(root: string, required: true): Promise<Repo>
  private async repo(root: string, required = false): Promise<Repo | undefined> {
    const prefix = await this.git(root, ['rev-parse', '--show-prefix']).catch(() => undefined)
    if (prefix === undefined) {
      if (required) throw new Error(`${root} is not in a git repository`)
      return undefined
    }
    const head = await this.git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(
      () => true,
      () => false,
    )
    return { prefix: prefix.trim(), head, base: head ? 'HEAD' : EMPTY_TREE }
  }

  private async git(cwd: string, args: string[], ok: number[] = [0]): Promise<string> {
    // No optional locks: the agent may be running git in the same repository.
    const env = { ...(await this.opts.env()), GIT_OPTIONAL_LOCKS: '0' }
    return new Promise((resolve, reject) => {
      execFile('git', ['-c', 'core.quotePath=off', ...args], { cwd, env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
        if (ok.includes(code)) resolve(stdout)
        else reject(new Error(stderr.trim() || err?.message || `git ${args[0]} failed`))
      })
    })
  }
}

interface Repo {
  prefix: string
  /** The repository has a commit. */
  head: boolean
  base: string
}

/** A path under the workspace as git takes it from the workspace: one that
 * leaves the workspace (../) or is absolute is refused, and git reads it
 * literally, not as a pattern. */
function literal(path: string): string {
  const p = normalize(path)
  if (!p || p === '.' || isAbsolute(p) || p === '..' || p.startsWith(`..${sep}`)) throw new Error(`${path} is not a path in the workspace`)
  return `:(literal)${p}`
}

/** How much of a file's change the index holds: X is the index against
 * HEAD, Y the working tree against the index. */
function stagedOf(xy: string): FileChange['staged'] {
  const [x, y] = xy
  if (x === ' ' || x === '?') return 'none'
  return y === ' ' ? 'all' : 'part'
}

/** The file against the last commit, from both of porcelain's columns:
 * the index (X) and the working tree (Y). A file added to the index and
 * then deleted is in neither, so it has not changed. */
function kindOf(xy: string): FileChange['kind'] | undefined {
  if (xy === '??') return 'untracked'
  const [x, y] = xy
  const inHead = x !== 'A'
  const inTree = y !== 'D' && !(x === 'D' && y === ' ')
  if (!inHead) return inTree ? 'added' : undefined
  return inTree ? 'modified' : 'deleted'
}
