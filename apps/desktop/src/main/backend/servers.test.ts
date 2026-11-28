import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_SERVER, type ServersSettings } from '../../shared/ipc'
import { refusalOf, sendAccessToken, ServerStore, serverRefusal, serverSources, serverURL, type Sealer, type ServerTarget } from './servers'

const sealer: Sealer = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (plain) => Buffer.from(`sealed:${plain}`),
  decryptStringAsync: async (sealed) => {
    const text = sealed.toString()
    if (!text.startsWith('sealed:')) throw new Error('not ours')
    return { result: text.slice('sealed:'.length), shouldReEncrypt: false }
  },
}

const input = { name: 'Mac mini', url: 'wss://ollupi.example.com', token: 'abc.default', accessClientId: 'id.access', accessClientSecret: 'shh' }

const first = (state: ServersSettings) => state.servers[0]!

describe('ServerStore', () => {
  let dir: string
  let store: ServerStore
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollupi-servers-'))
    store = new ServerStore(join(dir, 'servers.json'), sealer, join(dir, 'remote.json'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('runs this Mac’s backend while no server is registered', async () => {
    expect(await store.target()).toBeUndefined()
    expect(await store.read()).toEqual({ active: LOCAL_SERVER, servers: [] })
  })

  it('keeps the secrets sealed, and hands them out only to the main process', async () => {
    await store.save(input)
    const file = await readFile(join(dir, 'servers.json'), 'utf8')
    expect(file).not.toContain('abc.default')
    expect(file).not.toContain('shh')
    const state = await store.read()
    expect(state.servers).toEqual([
      { id: expect.any(String), name: 'Mac mini', url: 'wss://ollupi.example.com/', accessClientId: 'id.access', hasToken: true, hasAccessSecret: true },
    ])
    // A new server does not become the one in use: that is a switch.
    expect(state.active).toBe(LOCAL_SERVER)
    expect(await store.target()).toBeUndefined()
    await store.select(first(state).id)
    expect(await store.target()).toEqual({ url: 'wss://ollupi.example.com/', token: 'abc.default', access: { clientId: 'id.access', clientSecret: 'shh' } })
  })

  it('names a server by its host when it is given no name', async () => {
    await store.save({ ...input, name: '  ' })
    expect(first(await store.read()).name).toBe('ollupi.example.com')
  })

  it('keeps the secrets an edit leaves empty, and drops Access when its id is cleared', async () => {
    await store.save(input)
    const { id } = first(await store.read())
    await store.save({ ...input, id, name: 'Home', token: '', accessClientSecret: '' })
    expect(first(await store.read()).name).toBe('Home')
    expect(await store.target()).toBeUndefined()
    await store.select(id)
    expect(await store.target()).toMatchObject({ token: 'abc.default', access: { clientSecret: 'shh' } })
    await store.save({ ...input, id, token: '', accessClientId: '', accessClientSecret: '' })
    expect(await store.target()).toMatchObject({ token: 'abc.default', access: undefined })
  })

  it('switches between servers, and never removes the one in use', async () => {
    await store.save(input)
    await store.save({ ...input, name: 'Laptop', url: 'ws://127.0.0.1:7777' })
    const [mac, laptop] = (await store.read()).servers
    await store.select(mac!.id)
    expect((await store.read()).active).toBe(mac!.id)
    await expect(store.remove(mac!.id)).rejects.toThrow('switch away')
    await store.select(laptop!.id)
    await expect(store.remove(LOCAL_SERVER)).rejects.toThrow('not removed')
    await store.remove(mac!.id)
    expect((await store.read()).servers.map((s) => s.name)).toEqual(['Laptop'])
    await expect(store.select(mac!.id)).rejects.toThrow('no longer there')
  })

  it('refuses what cannot connect', async () => {
    await expect(store.save({ ...input, token: 'no-profile' })).rejects.toThrow('<secret>.<profile>')
    await expect(store.save({ ...input, token: '' })).rejects.toThrow('gateway token')
    await expect(store.save({ ...input, url: '' })).rejects.toThrow('address')
    await expect(store.save({ ...input, accessClientSecret: '' })).rejects.toThrow('client secret')
    await expect(store.save({ ...input, accessClientSecret: 'a b' })).rejects.toThrow('spaces')
  })

  it('refuses a token a browser cannot carry in the handshake', async () => {
    // The token travels as a WebSocket subprotocol; a comma, space, “=” or
    // “/” makes the browser refuse it before the gateway sees it.
    for (const token of ['abc,def.default', 'abc def.default', 'abc=.default', 'abc/def.default', 'a.b.c']) {
      await expect(store.save({ ...input, token })).rejects.toThrow('<secret>.<profile>')
    }
    // A hex or base64url secret does.
    await store.save({ ...input, token: `${'a'.repeat(64)}.default` })
    await store.save({ ...input, token: 'a-b_c+d.default' })
  })

  it('saves nothing it cannot encrypt', async () => {
    const locked = new ServerStore(join(dir, 'servers.json'), { ...sealer, isAsyncEncryptionAvailable: async () => false })
    await expect(locked.save(input)).rejects.toThrow('keychain')
  })

  it('says so when a secret this Mac cannot open is saved as the one in use', async () => {
    await store.save(input)
    const { id } = first(await store.read())
    await store.select(id)
    const other = new ServerStore(join(dir, 'servers.json'), { ...sealer, decryptStringAsync: async () => Promise.reject(new Error('another key')) })
    await expect(other.target()).rejects.toThrow('enter it again')
    // The server is still listed, its token to be entered again.
    expect(first(await other.read()).hasToken).toBe(true)
  })

  it('takes the one remote an older version kept in', async () => {
    const sealed = (s: string) => Buffer.from(`sealed:${s}`).toString('base64')
    await writeFile(
      join(dir, 'remote.json'),
      JSON.stringify({ enabled: true, url: 'wss://home.example.com/', token: sealed('old.home'), accessClientId: sealed('id.access'), accessClientSecret: sealed('shh') }),
    )
    const state = await store.read()
    expect(state.servers.map((s) => [s.name, s.url, s.hasToken])).toEqual([['home.example.com', 'wss://home.example.com/', true]])
    expect(state.active).toBe(first(state).id)
    expect(await store.target()).toEqual({ url: 'wss://home.example.com/', token: 'old.home', access: { clientId: 'id.access', clientSecret: 'shh' } })
    // Retired, not deleted, and read once only.
    await expect(readFile(join(dir, 'remote.json'), 'utf8')).rejects.toThrow()
    await readFile(join(dir, 'remote.json.migrated'), 'utf8')
  })

  it('keeps a remote an older version had switched off, without selecting it', async () => {
    const sealed = (s: string) => Buffer.from(`sealed:${s}`).toString('base64')
    await writeFile(join(dir, 'remote.json'), JSON.stringify({ enabled: false, url: 'wss://home.example.com/', token: sealed('old.home') }))
    const state = await store.read()
    expect(state.active).toBe(LOCAL_SERVER)
    expect(state.servers).toHaveLength(1)
    expect(await store.target()).toBeUndefined()
  })
})

describe('serverURL', () => {
  it('takes the host of a wss:// address, at the root', () => {
    expect(serverURL(' wss://ollupi.example.com ')).toBe('wss://ollupi.example.com/')
    expect(serverURL('wss://ollupi.example.com:8443/')).toBe('wss://ollupi.example.com:8443/')
  })

  it('takes ws:// only on this Mac, for a server started here or an SSH tunnel', () => {
    expect(serverURL('ws://127.0.0.1:7777')).toBe('ws://127.0.0.1:7777/')
    expect(serverURL('ws://localhost:7777')).toBe('ws://localhost:7777/')
    expect(() => serverURL('ws://ollupi.example.com')).toThrow('wss://')
    expect(() => serverURL('ws://192.168.1.5:7777')).toThrow('wss://')
    expect(() => serverURL('https://ollupi.example.com')).toThrow('wss://')
    expect(() => serverURL('ollupi.example.com')).toThrow('wss://')
  })

  it('refuses a path, a query or credentials', () => {
    expect(() => serverURL('wss://ollupi.example.com/ws')).toThrow('host alone')
    expect(() => serverURL('wss://ollupi.example.com/?token=x')).toThrow('host alone')
    expect(() => serverURL('wss://me:secret@ollupi.example.com')).toThrow('host alone')
  })
})

const target: ServerTarget = { url: 'wss://ollupi.example.com/', token: 'abc.default', access: { clientId: 'id.access', clientSecret: 'shh' } }

describe('serverSources', () => {
  it('reaches the WebSocket and the same host over HTTPS', () => {
    expect(serverSources(target)).toEqual(['wss://ollupi.example.com', 'https://ollupi.example.com'])
    expect(serverSources({ ...target, url: 'ws://127.0.0.1:7777/' })).toEqual(['ws://127.0.0.1:7777', 'http://127.0.0.1:7777'])
  })
})

describe('sendAccessToken', () => {
  type Listener = (details: { requestHeaders: Record<string, string> }, callback: (r: { requestHeaders: Record<string, string> }) => void) => void
  const fake = () => {
    const calls: { filter: { urls: string[] } | null; listener?: Listener }[] = []
    const webRequest = { onBeforeSendHeaders: (filter: { urls: string[] } | null, listener?: Listener) => calls.push({ filter, listener }) }
    return { calls, webRequest: webRequest as unknown as Electron.WebRequest }
  }

  it('adds the service token to requests for the server’s host only', () => {
    const { calls, webRequest } = fake()
    sendAccessToken(webRequest, target)
    expect(calls[0]?.filter).toEqual({ urls: ['wss://ollupi.example.com/*', 'https://ollupi.example.com/*'] })
    let sent: Record<string, string> = {}
    calls[0]?.listener?.({ requestHeaders: { Origin: 'app://ollupi' } }, (r) => (sent = r.requestHeaders))
    expect(sent).toEqual({ Origin: 'app://ollupi', 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'shh' })
  })

  it('stops adding it without a server behind Access', () => {
    const { calls, webRequest } = fake()
    sendAccessToken(webRequest, undefined)
    sendAccessToken(webRequest, { ...target, access: undefined })
    expect(calls).toEqual([{ filter: null, listener: undefined }, { filter: null, listener: undefined }])
  })
})

describe('serverRefusal', () => {
  it('asks the root as the WebSocket does', async () => {
    let asked: { url: string; init: RequestInit } | undefined
    const refused = await serverRefusal(async (url, init) => {
      asked = { url, init }
      return new Response('', { status: 426 })
    }, target)
    expect(refused).toBeUndefined()
    expect(asked?.url).toBe('https://ollupi.example.com/')
    expect(asked?.init.headers).toEqual({ Authorization: 'Bearer abc.default', 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'shh' })
    expect(asked?.init.redirect).toBe('manual')
  })

  it('tells Access from the gateway', async () => {
    const answer = (status: number, body = '', headers: Record<string, string> = {}) => serverRefusal(async () => new Response(body, { status, headers }), target)
    expect(await answer(401, 'invalid or missing gateway token\n')).toBe('token')
    expect(await answer(403, '<html>Forbidden</html>')).toBe('access')
    expect(await answer(403, 'host not allowed\n')).toBe('host')
  })

  it('leaves a host it cannot reach to the next attempt', async () => {
    expect(await serverRefusal(async () => Promise.reject(new TypeError('fetch failed')), target)).toBeUndefined()
  })
})

describe('refusalOf', () => {
  it('reads a redirect to the Access login as Access refusing', () => {
    expect(refusalOf(302, 'https://team.cloudflareaccess.com/cdn-cgi/access/login/ollupi.example.com', '')).toBe('access')
    expect(refusalOf(302, 'https://elsewhere.example.com/', '')).toBeUndefined()
    expect(refusalOf(502, '', '')).toBeUndefined()
  })
})
