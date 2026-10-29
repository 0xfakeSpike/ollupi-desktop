import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import type { UpdateState } from '../shared/ipc'
import { AppUpdater, bundleOf, newer, releaseFile, swapIn } from './update'

const ID = 'dev.ollupi.desktop'

describe('newer', () => {
  it('compares x.y.z part by part', () => {
    expect(newer('0.3.0', '0.2.0')).toBe(true)
    expect(newer('0.10.0', '0.9.9')).toBe(true)
    expect(newer('1.0.0', '0.99.99')).toBe(true)
    expect(newer('0.2.0', '0.2.0')).toBe(false)
    expect(newer('0.1.9', '0.2.0')).toBe(false)
  })

  it('never takes a version of another form as later', () => {
    expect(newer('0.3.0-beta.1', '0.2.0')).toBe(false)
    expect(newer('v0.3.0', '0.2.0')).toBe(false)
  })
})

describe('releaseFile', () => {
  // electron-builder's latest-mac.yml for both arches, trimmed.
  const manifest = {
    version: '0.3.0',
    files: [
      { url: 'Ollupi-0.3.0-arm64.zip', sha512: 'a', size: 10 },
      { url: 'Ollupi-0.3.0-arm64.dmg', sha512: 'b', size: 11 },
      { url: 'Ollupi-0.3.0-x64.zip', sha512: 'c', size: 12 },
      { url: 'Ollupi-0.3.0-x64.dmg', sha512: 'd', size: 13 },
    ],
    path: 'Ollupi-0.3.0-arm64.zip',
  }

  it("takes this arch's zip", () => {
    expect(releaseFile(manifest, 'arm64')).toEqual({ version: '0.3.0', url: 'Ollupi-0.3.0-arm64.zip', sha512: 'a', size: 10 })
    expect(releaseFile(manifest, 'x64')).toEqual({ version: '0.3.0', url: 'Ollupi-0.3.0-x64.zip', sha512: 'c', size: 12 })
  })

  it('refuses a release without one', () => {
    expect(() => releaseFile({ ...manifest, files: manifest.files.filter((f) => !f.url.includes('x64')) }, 'x64')).toThrow('no zip for x64')
    expect(() => releaseFile({ version: '0.3.0' }, 'arm64')).toThrow()
    expect(() => releaseFile(undefined, 'arm64')).toThrow()
  })
})

describe('bundleOf', () => {
  it('is the .app the executable is in', () => {
    expect(bundleOf('/Applications/Ollupi.app/Contents/MacOS/Ollupi')).toBe('/Applications/Ollupi.app')
    expect(bundleOf('/usr/local/bin/electron')).toBeUndefined()
  })
})

describe('AppUpdater', () => {
  let dir: string
  let installed: string
  let staging: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-update-'))
    installed = join(dir, 'Applications', 'Ollupi.app')
    staging = join(dir, 'staging')
    await fakeApp(installed, ID, '0.2.0')
  })

  afterEach(async () => {
    await chmod(join(dir, 'Applications'), 0o755)
    await rm(dir, { recursive: true, force: true })
  })

  /** A release of version whose zip holds an app with id and version. */
  async function release(version: string, opts: { id?: string; corrupt?: boolean } = {}) {
    const app = join(dir, 'build', version, 'Ollupi.app')
    await fakeApp(app, opts.id ?? ID, version)
    const zipPath = join(dir, 'build', `${version}.zip`)
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, zipPath])
    const zip = await readFile(zipPath)
    const url = `Ollupi-${version}-arm64.zip`
    const manifest = stringify({ version, files: [{ url, sha512: createHash('sha512').update(zip).digest('base64'), size: zip.length }] })
    const asked: string[] = []
    const fetch = async (u: string) => {
      asked.push(u)
      if (u.endsWith('/latest/download/latest-mac.yml')) return new Response(manifest)
      if (u.endsWith(`/download/v${version}/${url}`)) return new Response(opts.corrupt ? zip.subarray(1) : zip)
      return new Response('not found', { status: 404 })
    }
    return { fetch, asked }
  }

  function updater(fetch: (url: string) => Promise<Response>, opts: { bundle?: string | undefined } = { bundle: installed }) {
    const u = new AppUpdater({ fetch, version: '0.2.0', arch: 'arm64', bundle: opts.bundle, staging, quit: () => {} })
    const states: UpdateState[] = []
    u.on('state', (s) => states.push(s))
    return { u, states }
  }

  it('finds a newer release, and downloads it only when asked', async () => {
    const { fetch, asked } = await release('0.3.0')
    const { u, states } = updater(fetch)
    await u.check()
    expect(u.state).toEqual({ status: 'available', version: '0.3.0' })
    expect(asked).toHaveLength(1)
    await u.download()
    expect(u.state).toEqual({ status: 'ready', version: '0.3.0' })
    const downloads = states.filter((s) => s.status === 'downloading')
    expect(downloads.at(-1)).toMatchObject({ received: downloads[0]!.total })
    expect(asked[1]).toBe('https://github.com/0xfakeSpike/ollupi-desktop/releases/download/v0.3.0/Ollupi-0.3.0-arm64.zip')
    expect(await readdir(join(staging, '0.3.0'))).toEqual(['Ollupi.app'])
  })

  it('is up to date when the latest release is not newer', async () => {
    const { fetch } = await release('0.2.0')
    const { u } = updater(fetch)
    await u.check()
    expect(u.state).toEqual({ status: 'latest' })
  })

  it('reports a failed check', async () => {
    const { u } = updater(async () => new Response('', { status: 404 }))
    await u.check()
    expect(u.state).toEqual({ status: 'failed', version: undefined, failure: { kind: 'error', message: 'latest-mac.yml: HTTP 404' } })
  })

  it('refuses a download that does not match its checksum', async () => {
    const { fetch } = await release('0.3.0', { corrupt: true })
    const { u } = updater(fetch)
    await u.check()
    await u.download()
    expect(u.state).toMatchObject({ status: 'failed', version: '0.3.0', failure: { kind: 'error', message: expect.stringContaining('checksum') } })
  })

  it('refuses a zip that holds another app', async () => {
    const { fetch } = await release('0.3.0', { id: 'com.example.other' })
    const { u } = updater(fetch)
    await u.check()
    await u.download()
    expect(u.state).toMatchObject({ status: 'failed', failure: { kind: 'error', message: `The zip holds com.example.other, not ${ID}` } })
  })

  it('says when the app cannot be replaced where it is', async () => {
    const { fetch, asked } = await release('0.3.0')
    const { u } = updater(fetch)
    await u.check()
    await chmod(join(dir, 'Applications'), 0o555)
    await u.download()
    expect(u.state).toEqual({ status: 'failed', version: '0.3.0', failure: { kind: 'location', path: installed } })
    expect(asked).toHaveLength(1)
  })

  it('has nothing to update outside an installed app', async () => {
    const { fetch, asked } = await release('0.3.0')
    const { u } = updater(fetch, { bundle: undefined })
    await u.check()
    expect(u.state).toEqual({ status: 'unsupported' })
    expect(asked).toHaveLength(0)
  })
})

describe('swapIn', () => {
  it('replaces the installed app once the process has exited', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ollupi-swap-'))
    try {
      const installed = join(dir, 'Applications', 'Ollupi.app')
      const staged = join(dir, 'staging', 'Ollupi.app')
      await fakeApp(installed, ID, '0.2.0')
      await fakeApp(staged, ID, '0.3.0')
      const app = spawn('/bin/sleep', ['0.5'])
      const swap = swapIn(staged, installed, app.pid!, false)
      // Still waiting for the app.
      await new Promise((r) => setTimeout(r, 200))
      expect(await version(installed)).toBe('0.2.0')
      await once(swap, 'exit')
      expect(await version(installed)).toBe('0.3.0')
      expect(await readdir(join(dir, 'Applications'))).toEqual(['Ollupi.app'])
      expect(await readdir(join(dir, 'staging'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

async function fakeApp(path: string, id: string, version: string): Promise<void> {
  await mkdir(join(path, 'Contents', 'MacOS'), { recursive: true })
  await writeFile(
    join(path, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
</dict></plist>`,
  )
}

async function version(app: string): Promise<string> {
  return execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')])
    .toString()
    .trim()
}
