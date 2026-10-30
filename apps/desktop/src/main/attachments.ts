// Files a message sends that exist only in the renderer's memory (a pasted
// screenshot, an image dragged from a web page). ollupi attaches a file by
// its path and copies it while it takes the message, so such a file is
// written here just before the message is sent and removed once it is.

import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

export class TempAttachments {
  constructor(private readonly dir: string) {}

  /** Clears what an earlier run of the app left, e.g. when it crashed while
   * sending. */
  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true })
  }

  /** Writes data under its own name, so the attachment keeps it. */
  async write(name: string, data: Uint8Array): Promise<string> {
    const path = join(this.dir, randomUUID(), basename(name) || 'attachment')
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, data, { mode: 0o600 })
    return path
  }

  /** Removes a file write made; any other path is refused. */
  async remove(path: string): Promise<void> {
    const folder = dirname(resolve(path))
    if (dirname(folder) !== this.dir) throw new Error('not a temporary attachment')
    await rm(folder, { recursive: true, force: true })
  }
}
