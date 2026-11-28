import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bridgeURL, SandboxStore } from './sandbox'
import type { Sealer } from './servers'

const sealer: Sealer = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (plain) => Buffer.from(`sealed:${plain}`),
  decryptStringAsync: async (sealed) => {
    const text = sealed.toString()
    if (!text.startsWith('sealed:')) throw new Error('not ours')
    return { result: text.slice('sealed:'.length), shouldReEncrypt: false }
  },
}

const input = { url: 'https://sandbox-bridge.example.workers.dev', key: 'cabae37c' }

describe('SandboxStore', () => {
  let dir: string
  let store: SandboxStore
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-sandbox-'))
    store = new SandboxStore(join(dir, 'sandbox.json'), sealer)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('offers this machine alone while no bridge is kept', async () => {
    expect(await store.read()).toEqual({ url: '', hasKey: false })
    expect(await store.env()).toEqual({})
  })

  it('keeps the token sealed, and gives it to the backend as its variables', async () => {
    await store.save(input)
    const file = await readFile(join(dir, 'sandbox.json'), 'utf8')
    expect(file).not.toContain(input.key)
    expect(await store.read()).toEqual({ url: input.url, hasKey: true })
    expect(await store.env()).toEqual({ SANDBOX_API_URL: input.url, SANDBOX_API_KEY: input.key })
  })

  it('keeps the token when a save leaves it empty, and moves the address', async () => {
    await store.save(input)
    await store.save({ url: 'https://other.example.workers.dev', key: '' })
    expect(await store.env()).toEqual({ SANDBOX_API_URL: 'https://other.example.workers.dev', SANDBOX_API_KEY: input.key })
  })

  it('refuses an address that is not the bridge’s host over https', async () => {
    await expect(store.save({ ...input, url: '' })).rejects.toThrow('address')
    await expect(store.save({ ...input, url: 'sandbox-bridge.example.workers.dev' })).rejects.toThrow('https://')
    await expect(store.save({ ...input, url: 'http://sandbox-bridge.example.workers.dev' })).rejects.toThrow('https://')
    await expect(store.save({ ...input, url: 'https://example.com/v1' })).rejects.toThrow('host alone')
    // A bridge started on this Mac is plain http.
    expect(bridgeURL('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  })

  it('refuses a token it cannot be given, and a bridge without one', async () => {
    await expect(store.save({ ...input, key: 'a b' })).rejects.toThrow('spaces')
    await expect(store.save({ ...input, key: '' })).rejects.toThrow('token')
  })

  it('starts the backend without a bridge whose token this Mac cannot open', async () => {
    const sealed = (s: string) => Buffer.from(`other:${s}`).toString('base64')
    await writeFile(join(dir, 'sandbox.json'), JSON.stringify({ url: input.url, key: sealed('cabae37c') }))
    expect(await store.env()).toEqual({})
  })

  it('removes the bridge, and keeps no file', async () => {
    await store.save(input)
    await store.clear()
    expect(await store.read()).toEqual({ url: '', hasKey: false })
    expect(await store.env()).toEqual({})
    await expect(readFile(join(dir, 'sandbox.json'), 'utf8')).rejects.toThrow()
  })

  it('cannot keep a bridge where the keychain is unavailable', async () => {
    const locked: Sealer = { ...sealer, isAsyncEncryptionAvailable: async () => false }
    await expect(new SandboxStore(join(dir, 'sandbox.json'), locked).save(input)).rejects.toThrow('keychain')
  })
})
