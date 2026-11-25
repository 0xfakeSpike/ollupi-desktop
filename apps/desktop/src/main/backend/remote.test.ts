import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { refusalOf, remoteRefusal, remoteSources, RemoteStore, remoteURL, sendAccessToken, type RemoteTarget, type Sealer } from './remote'

const sealer: Sealer = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (plain) => Buffer.from(`sealed:${plain}`),
  decryptStringAsync: async (sealed) => {
    const text = sealed.toString()
    if (!text.startsWith('sealed:')) throw new Error('not ours')
    return { result: text.slice('sealed:'.length), shouldReEncrypt: false }
  },
}

const input = { enabled: true, url: 'wss://ollupi.example.com', token: 'abc.default', accessClientId: 'id.access', accessClientSecret: 'shh' }

describe('RemoteStore', () => {
  let dir: string
  let store: RemoteStore
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-remote-'))
    store = new RemoteStore(join(dir, 'remote.json'), sealer)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('runs this Mac’s backend until a remote is set', async () => {
    expect(await store.target()).toBeUndefined()
    expect(await store.read()).toEqual({ enabled: false, url: '', accessClientId: '', hasToken: false, hasAccessSecret: false })
  })

  it('keeps the secrets sealed and hands them out only to the main process', async () => {
    await store.save(input)
    const file = await readFile(join(dir, 'remote.json'), 'utf8')
    expect(file).not.toContain('abc.default')
    expect(file).not.toContain('shh')
    expect(await store.read()).toEqual({ enabled: true, url: 'wss://ollupi.example.com/', accessClientId: 'id.access', hasToken: true, hasAccessSecret: true })
    expect(await store.target()).toEqual({ url: 'wss://ollupi.example.com/', token: 'abc.default', access: { clientId: 'id.access', clientSecret: 'shh' } })
  })

  it('keeps the secrets an edit leaves empty, and drops Access when its id is cleared', async () => {
    await store.save(input)
    await store.save({ ...input, token: '', accessClientSecret: '' })
    expect(await store.target()).toMatchObject({ token: 'abc.default', access: { clientSecret: 'shh' } })
    await store.save({ ...input, token: '', accessClientId: '', accessClientSecret: '' })
    expect(await store.target()).toMatchObject({ token: 'abc.default', access: undefined })
  })

  it('keeps a remote it is not connecting to', async () => {
    await store.save({ ...input, enabled: false })
    expect(await store.target()).toBeUndefined()
    expect((await store.read()).hasToken).toBe(true)
  })

  it('refuses what cannot connect', async () => {
    await expect(store.save({ ...input, token: 'no-profile' })).rejects.toThrow('<secret>.<profile>')
    await expect(store.save({ ...input, token: '' })).rejects.toThrow('gateway token')
    await expect(store.save({ ...input, url: '' })).rejects.toThrow('address')
    await expect(store.save({ ...input, accessClientSecret: '' })).rejects.toThrow('client secret')
    await expect(store.save({ ...input, accessClientSecret: 'a b' })).rejects.toThrow('spaces')
  })

  it('saves nothing it cannot encrypt', async () => {
    const locked = new RemoteStore(join(dir, 'remote.json'), { ...sealer, isAsyncEncryptionAvailable: async () => false })
    await expect(locked.save(input)).rejects.toThrow('keychain')
  })

  it('asks again for a secret this Mac cannot open', async () => {
    await store.save(input)
    const other = new RemoteStore(join(dir, 'remote.json'), { ...sealer, decryptStringAsync: async () => Promise.reject(new Error('another key')) })
    expect(await other.target()).toBeUndefined()
  })
})

describe('remoteURL', () => {
  it('takes the host of a wss:// address, at the root', () => {
    expect(remoteURL(' wss://ollupi.example.com ')).toBe('wss://ollupi.example.com/')
    expect(remoteURL('wss://ollupi.example.com:8443/')).toBe('wss://ollupi.example.com:8443/')
  })

  it('takes ws:// only on this Mac, for an SSH tunnel', () => {
    expect(remoteURL('ws://127.0.0.1:7777')).toBe('ws://127.0.0.1:7777/')
    expect(() => remoteURL('ws://ollupi.example.com')).toThrow('wss://')
    expect(() => remoteURL('https://ollupi.example.com')).toThrow('wss://')
    expect(() => remoteURL('ollupi.example.com')).toThrow('wss://')
  })

  it('refuses a path, a query or credentials', () => {
    expect(() => remoteURL('wss://ollupi.example.com/ws')).toThrow('host alone')
    expect(() => remoteURL('wss://ollupi.example.com/?token=x')).toThrow('host alone')
    expect(() => remoteURL('wss://me:pw@ollupi.example.com')).toThrow('host alone')
  })
})

const target: RemoteTarget = { url: 'wss://ollupi.example.com/', token: 'abc.default', access: { clientId: 'id.access', clientSecret: 'shh' } }

describe('remoteSources', () => {
  it('reaches the WebSocket and the same host over HTTPS', () => {
    expect(remoteSources(target)).toEqual(['wss://ollupi.example.com', 'https://ollupi.example.com'])
    expect(remoteSources({ ...target, url: 'ws://127.0.0.1:7777/' })).toEqual(['ws://127.0.0.1:7777', 'http://127.0.0.1:7777'])
  })
})

describe('sendAccessToken', () => {
  type Listener = (details: { requestHeaders: Record<string, string> }, callback: (r: { requestHeaders: Record<string, string> }) => void) => void
  const fake = () => {
    const calls: { filter: { urls: string[] } | null; listener?: Listener }[] = []
    const webRequest = { onBeforeSendHeaders: (filter: { urls: string[] } | null, listener?: Listener) => calls.push({ filter, listener }) }
    return { calls, webRequest: webRequest as unknown as Electron.WebRequest }
  }

  it('adds the service token to requests for the remote host only', () => {
    const { calls, webRequest } = fake()
    sendAccessToken(webRequest, target)
    expect(calls[0]?.filter).toEqual({ urls: ['wss://ollupi.example.com/*', 'https://ollupi.example.com/*'] })
    let sent: Record<string, string> = {}
    calls[0]?.listener?.({ requestHeaders: { Origin: 'app://ollupi' } }, (r) => (sent = r.requestHeaders))
    expect(sent).toEqual({ Origin: 'app://ollupi', 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'shh' })
  })

  it('stops adding it without a remote behind Access', () => {
    const { calls, webRequest } = fake()
    sendAccessToken(webRequest, undefined)
    sendAccessToken(webRequest, { ...target, access: undefined })
    expect(calls).toEqual([{ filter: null, listener: undefined }, { filter: null, listener: undefined }])
  })
})

describe('remoteRefusal', () => {
  it('asks the root as the WebSocket does', async () => {
    let asked: { url: string; init: RequestInit } | undefined
    const refused = await remoteRefusal(async (url, init) => {
      asked = { url, init }
      return new Response('', { status: 426 })
    }, target)
    expect(refused).toBeUndefined()
    expect(asked?.url).toBe('https://ollupi.example.com/')
    expect(asked?.init.headers).toEqual({ Authorization: 'Bearer abc.default', 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'shh' })
    expect(asked?.init.redirect).toBe('manual')
  })

  it('tells Access from the gateway', async () => {
    const answer = (status: number, body = '', headers: Record<string, string> = {}) => remoteRefusal(async () => new Response(body, { status, headers }), target)
    expect(await answer(401, 'invalid or missing gateway token\n')).toBe('token')
    expect(await answer(403, '<html>Forbidden</html>')).toBe('access')
    expect(await answer(403, 'host not allowed\n')).toBe('host')
  })

  it('leaves a host it cannot reach to the next attempt', async () => {
    expect(await remoteRefusal(async () => Promise.reject(new TypeError('fetch failed')), target)).toBeUndefined()
  })
})

describe('refusalOf', () => {
  it('reads a redirect to the Access login as Access refusing', () => {
    expect(refusalOf(302, 'https://team.cloudflareaccess.com/cdn-cgi/access/login/ollupi.example.com', '')).toBe('access')
    expect(refusalOf(302, 'https://elsewhere.example.com/', '')).toBeUndefined()
    expect(refusalOf(502, '', '')).toBeUndefined()
  })
})
