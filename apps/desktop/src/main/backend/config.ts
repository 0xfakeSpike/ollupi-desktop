// The backend's config.yaml, owned by the main process: the renderer reads
// it and asks for changes, never touching the file. ollupi reads its
// configuration once at start, so a change takes effect by restarting the
// backend; apply() validates, writes and restarts as one step, and a change
// the backend would refuse never reaches the file.

import { execFile } from 'node:child_process'
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isMap, isSeq, parseDocument, type Document } from 'yaml'
import type { ConfigChange, ConfigCheck } from '../../shared/ipc'

export interface ConfigOptions {
  binary: string
  home: string
  env(): Promise<NodeJS.ProcessEnv>
  restart(): Promise<void>
}

export class BackendConfig {
  readonly path: string

  constructor(private readonly opts: ConfigOptions) {
    this.path = join(opts.home, 'config.yaml')
  }

  /** The current file as the backend decodes it, or why it would not start. */
  read(): Promise<ConfigCheck> {
    return this.check(this.path)
  }

  /** Applies changes to the file, keeping its comments and layout, if the
   * backend accepts the result; then restarts the backend with it. */
  async apply(changes: ConfigChange[]): Promise<ConfigCheck> {
    const edited = editConfigText(await readFile(this.path, 'utf8'), changes)
    if (!edited.ok) return edited
    // Next to the real file, so the final rename is atomic.
    const candidate = `${this.path}.candidate`
    await writeFile(candidate, edited.text, { mode: 0o600 })
    try {
      const result = await this.check(candidate)
      // The change is to config.yaml; the candidate is only how it is checked.
      if (!result.ok) return { ok: false, error: result.error.replaceAll(candidate, this.path) }
      await chmod(candidate, 0o600)
      await rename(candidate, this.path)
      await this.opts.restart()
      return result
    } finally {
      await rm(candidate, { force: true })
    }
  }

  /** ollupid --check-config: the backend's own validation, run with the
   * environment the backend gets (MCP ${NAME} references must resolve). */
  private async check(file: string): Promise<ConfigCheck> {
    const env = await this.opts.env()
    return new Promise((resolve) => {
      execFile(this.opts.binary, ['--home', this.opts.home, '--check-config', file], { env, timeout: 30_000 }, (err, stdout) => {
        try {
          resolve(JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as ConfigCheck)
        } catch {
          resolve({ ok: false, error: err ? `cannot check the config: ${err.message}` : 'cannot check the config' })
        }
      })
    })
  }
}

/** Applies changes to config.yaml text, keeping its comments where a person
 * reads them. */
export function editConfigText(text: string, changes: ConfigChange[]): { ok: true; text: string } | { ok: false; error: string } {
  const doc = parseDocument(text)
  if (doc.errors.length) return { ok: false, error: doc.errors[0]!.message }
  attachSectionComments(doc)
  for (const c of changes) {
    if (c.kind === 'delete') doc.deleteIn(c.path)
    else if (c.kind === 'set') doc.setIn(c.path, doc.createNode(c.value))
    else {
      // The node itself moves, with the comments attached to it.
      const list = doc.getIn(c.path.slice(0, -1), true)
      const from = c.path.at(-1)
      if (!isSeq(list) || typeof from !== 'number' || from >= list.items.length || c.to < 0 || c.to >= list.items.length) {
        return { ok: false, error: `cannot move ${c.path.join('.')} to ${c.to}` }
      }
      list.items.splice(c.to, 0, ...list.items.splice(from, 1))
    }
  }
  return { ok: true, text: doc.toString() }
}

/** The YAML library stores the comment block above a top-level key as the
 * end of the previous section's trailing comment, and would re-indent it
 * into that section when writing. In the file a blank line separates the
 * two, so the part after the last blank line goes back to the next key. */
function attachSectionComments(doc: Document): void {
  if (!isMap(doc.contents)) return
  const pairs = doc.contents.items
  for (let i = 0; i < pairs.length - 1; i++) {
    const value = pairs[i]!.value as { comment?: string | null } | null
    const key = pairs[i + 1]!.key as { commentBefore?: string | null; spaceBefore?: boolean } | null
    const split = value?.comment?.lastIndexOf('\n\n') ?? -1
    if (!value?.comment || !key || split < 0) continue
    const above = value.comment.slice(split + 2)
    value.comment = value.comment.slice(0, split) || null
    key.commentBefore = key.commentBefore ? `${above}\n${key.commentBefore}` : above
    // The blank line that separated them stays above the comment.
    key.spaceBefore = true
  }
}
