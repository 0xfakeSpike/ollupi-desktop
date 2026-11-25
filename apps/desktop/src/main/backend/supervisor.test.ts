import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RemoteRefusal } from '../../shared/ipc'
import type { RemoteTarget } from './remote'
import { BackendSupervisor, type SupervisorOptions } from './supervisor'

describe('BackendSupervisor', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-supervisor-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const options = (binary: string, remote?: RemoteTarget, refused?: RemoteRefusal): SupervisorOptions => ({
    binary,
    home: dir,
    profile: 'default',
    allowOrigins: [],
    env: async () => process.env,
    logFile: join(dir, 'backend.log'),
    remote: async () => remote,
    refusal: async () => refused,
  })

  it('names each connection by the profile it acts as', async () => {
    const binary = join(dir, 'ollupid')
    await writeFile(binary, `#!/bin/sh
echo '{"type":"ready","url":"ws://127.0.0.1:1/"}'
exec cat >/dev/null
`)
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor(options(binary))
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
    const backend = new BackendSupervisor(options(binary))

    const ready = once(backend, 'state').then(async function wait([state]): Promise<void> {
      if ((state as { status: string }).status !== 'ready') return wait(await once(backend, 'state'))
    })
    await Promise.all([backend.restart(), backend.restart()])
    await ready
    await backend.stop()

    expect((await readFile(starts, 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  const reloading = (starts: string, reply: string) => `#!/bin/sh
echo started >> "${starts}"
trap 'echo "{\\"type\\":\\"${reply}\\"}"' HUP
echo '{"type":"ready","url":"ws://127.0.0.1:1/"}'
while :; do sleep 60 & wait $!; done
`

  async function ready(backend: BackendSupervisor): Promise<void> {
    while (backend.state.status !== 'ready') await once(backend, 'state')
  }

  it('reloads a running backend in place', async () => {
    const binary = join(dir, 'ollupid')
    const starts = join(dir, 'starts')
    await writeFile(binary, reloading(starts, 'reloaded'))
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor(options(binary))
    await backend.start()
    await ready(backend)
    await Promise.all([backend.reload(), backend.reload()])
    expect(backend.state.status).toBe('ready')
    await backend.stop()
    expect((await readFile(starts, 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  it('restarts a backend that cannot reload', async () => {
    const binary = join(dir, 'ollupid')
    const starts = join(dir, 'starts')
    await writeFile(binary, reloading(starts, 'reload_failed'))
    await chmod(binary, 0o755)
    const backend = new BackendSupervisor(options(binary))
    await backend.start()
    await ready(backend)
    await backend.reload()
    await ready(backend)
    await backend.stop()
    expect((await readFile(starts, 'utf8')).trim().split('\n')).toHaveLength(2)
  })

  const remote: RemoteTarget = { url: 'wss://ollupi.example.com/', token: 'secret.home', access: undefined }

  it('runs nothing for a remote, and hands out its address and token', async () => {
    const backend = new BackendSupervisor(options(join(dir, 'missing'), remote))
    await backend.start()
    expect(backend.state).toEqual({ status: 'ready', url: remote.url, token: remote.token, version: '' })
    // The remote's token names its profile; switching here does not change it.
    backend.selectProfile('work')
    expect(backend.state).toMatchObject({ token: 'secret.home' })
    await backend.check()
    expect(backend.state.status).toBe('ready')
    await backend.stop()
    expect(backend.state.status).toBe('stopped')
  })

  it('fails on a remote that refuses the connection, until it starts again', async () => {
    const backend = new BackendSupervisor(options(join(dir, 'missing'), remote, 'access'))
    await backend.start()
    await Promise.all([backend.check(), backend.check()])
    expect(backend.state).toMatchObject({ status: 'failed', failure: { kind: 'remote', refused: 'access', url: remote.url } })
    await backend.restart()
    expect(backend.state.status).toBe('ready')
  })
})
