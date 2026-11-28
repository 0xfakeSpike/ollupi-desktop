import { describe, expect, it } from 'vitest'
import { Db } from '../db'
import { bridgeURL, SandboxStore } from './sandbox'

const input = { url: 'https://sandbox-bridge.example.workers.dev', key: 'cabae37c' }

describe('SandboxStore', () => {
  it('offers this machine alone while no bridge is kept', async () => {
    const store = new SandboxStore(new Db(':memory:'))
    expect(await store.read()).toEqual({ url: '', hasKey: false })
    expect(await store.env()).toEqual({})
  })

  it('keeps the bridge in the app’s database, and gives it to the backend as its variables', async () => {
    const db = new Db(':memory:')
    const store = new SandboxStore(db)
    await store.save(input)
    // No keychain: the bridge's token is in the app's own row.
    expect(db.get('sandbox')).toContain(input.key)
    expect(await store.read()).toEqual({ url: input.url, hasKey: true })
    expect(await store.env()).toEqual({ SANDBOX_API_URL: input.url, SANDBOX_API_KEY: input.key })
  })

  it('keeps the token when a save leaves it empty, and moves the address', async () => {
    const store = new SandboxStore(new Db(':memory:'))
    await store.save(input)
    await store.save({ url: 'https://other.example.workers.dev', key: '' })
    expect(await store.env()).toEqual({ SANDBOX_API_URL: 'https://other.example.workers.dev', SANDBOX_API_KEY: input.key })
  })

  it('refuses an address that is not the bridge’s host over https', async () => {
    const store = new SandboxStore(new Db(':memory:'))
    await expect(store.save({ ...input, url: '' })).rejects.toThrow('address')
    await expect(store.save({ ...input, url: 'sandbox-bridge.example.workers.dev' })).rejects.toThrow('https://')
    await expect(store.save({ ...input, url: 'http://sandbox-bridge.example.workers.dev' })).rejects.toThrow('https://')
    await expect(store.save({ ...input, url: 'https://example.com/v1' })).rejects.toThrow('host alone')
    // A bridge started on this Mac is plain http.
    expect(bridgeURL('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  })

  it('refuses a token it cannot be given, and a bridge without one', async () => {
    const store = new SandboxStore(new Db(':memory:'))
    await expect(store.save({ ...input, key: 'a b' })).rejects.toThrow('spaces')
    await expect(store.save({ ...input, key: '' })).rejects.toThrow('token')
  })

  it('removes the bridge, and offers this machine only again', async () => {
    const db = new Db(':memory:')
    const store = new SandboxStore(db)
    await store.save(input)
    await store.clear()
    expect(db.get('sandbox')).toBeUndefined()
    expect(await store.read()).toEqual({ url: '', hasKey: false })
    expect(await store.env()).toEqual({})
  })

  it('offers no bridge whose row it cannot read', async () => {
    const db = new Db(':memory:')
    db.set('sandbox', 'not json')
    expect(await new SandboxStore(db).read()).toEqual({ url: '', hasKey: false })
  })
})
