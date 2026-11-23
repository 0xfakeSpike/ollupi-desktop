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

  it('names each connection by the profile it acts as', async () => {
    const binary = join(dir, 'ollupid')
    await writeFile(binary, `#!/bin/sh
echo '{"type":"ready","url":"ws://127.0.0.1:1/"}'
exec cat >/dev/null
`)
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor({ binary, home: dir, profile: 'default', allowOrigins: [], env: async () => process.env, logFile: join(dir, 'backend.log') })
    const tokens: string[] = []
    backend.on('state', (state) => {
      if (state.status === 'ready') tokens.push(state.token)
    })
    await backend.start()
    await once(backend, 'state')
    expect(tokens.at(-1)?.endsWith('.default')).toBe(true)

    backend.selectProfile('work')
    expect(tokens.at(-1)?.endsWith('.work')).toBe(true)
    // The same secret, so the backend takes it: only the profile changed.
    expect(tokens.at(-1)?.split('.')[0]).toBe(tokens[0]?.split('.')[0])
    await backend.stop()
  })

  it('runs one backend when restarts overlap', async () => {
    const binary = join(dir, 'ollupid')
    const starts = join(dir, 'starts')
    await writeFile(binary, `#!/bin/sh\necho started >> "${starts}"\necho '{"type":"ready","url":"ws://127.0.0.1:1/"}'\nexec cat >/dev/null\n`)
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor({ binary, home: dir, profile: 'default', allowOrigins: [], env: async () => process.env, logFile: join(dir, 'backend.log') })

    const ready = once(backend, 'state').then(async function wait([state]): Promise<void> {
      if ((state as { status: string }).status !== 'ready') return wait(await once(backend, 'state'))
    })
    await Promise.all([backend.restart(), backend.restart()])
    await ready
    await backend.stop()

    expect((await readFile(starts, 'utf8')).trim().split('\n')).toHaveLength(1)
  })
})
