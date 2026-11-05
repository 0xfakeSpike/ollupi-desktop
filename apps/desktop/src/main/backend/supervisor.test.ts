import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackendSupervisor } from './supervisor'

describe('BackendSupervisor', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-supervisor-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('runs one backend when restarts overlap', async () => {
    const binary = join(dir, 'ollupid')
    const starts = join(dir, 'starts')
    await writeFile(binary, `#!/bin/sh\necho started >> "${starts}"\necho '{"type":"ready","url":"ws://127.0.0.1:1/"}'\nexec cat >/dev/null\n`)
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor({ binary, home: dir, allowOrigins: [], env: async () => process.env, logFile: join(dir, 'backend.log') })

    const ready = once(backend, 'state').then(async function wait([state]): Promise<void> {
      if ((state as { status: string }).status !== 'ready') return wait(await once(backend, 'state'))
    })
    await Promise.all([backend.restart(), backend.restart()])
    await ready
    await backend.stop()

    expect((await readFile(starts, 'utf8')).trim().split('\n')).toHaveLength(1)
  })
})
