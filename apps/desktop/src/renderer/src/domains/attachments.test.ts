import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from '../gateway/connection'
import { attachmentFile, withMessageInput } from './attachments'

vi.mock('../platform/desktop', () => ({ desktop: {} }))

describe('attachments', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads one over HTTP at the gateway's address, with its token as a Bearer header", async () => {
    useConnection.setState({ backend: { status: 'ready', url: 'ws://127.0.0.1:4321/', token: 'secret', profile: 'default', version: '1' } })
    const fetch = vi.fn(async () => new Response('ship on friday\n', { headers: { 'Content-Type': 'text/plain' } }))
    vi.stubGlobal('fetch', fetch)
    const file = await attachmentFile('t 1', { id: 'a1', kind: 'file', name: 'notes.txt', mimeType: 'text/plain', size: 15, file: 'f', tokens: 4 })
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('http://127.0.0.1:4321/attachments/t%201/a1')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret')
    expect([file.name, file.type, await file.text()]).toEqual(['notes.txt', 'text/plain', 'ship on friday\n'])
  })

  it('refuses while the backend is not ready, and when the gateway says no', async () => {
    useConnection.setState({ backend: { status: 'starting' } })
    await expect(attachmentFile('t', { id: 'a2', kind: 'file', name: 'n', mimeType: 'text/plain', size: 1, file: 'f', tokens: 1 })).rejects.toThrow()
    useConnection.setState({ backend: { status: 'ready', url: 'ws://127.0.0.1:4321/', token: 'secret', profile: 'default', version: '1' } })
    vi.stubGlobal('fetch', async () => new Response('no such attachment', { status: 404 }))
    await expect(attachmentFile('t', { id: 'a3', kind: 'file', name: 'n', mimeType: 'text/plain', size: 1, file: 'f', tokens: 1 })).rejects.toThrow(/no such attachment/)
  })

  it('uploads each file before the message, which names the uploads', async () => {
    useConnection.setState({ backend: { status: 'ready', url: 'ws://127.0.0.1:4321/', token: 'secret', profile: 'default', version: '1' } })
    let n = 0
    const fetch = vi.fn(async () => Response.json({ uploadId: `u${++n}`, name: 'x', mimeType: 'text/plain', size: 1, kind: 'file' }))
    vi.stubGlobal('fetch', fetch)
    const sent = await withMessageInput('look', [new File(['a'], '笔记.txt'), new File(['b'], 'b.png')], async (input) => input)
    expect(sent).toEqual([
      { type: 'text', text: 'look' },
      { type: 'upload', uploadId: 'u1' },
      { type: 'upload', uploadId: 'u2' },
    ])
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect([url.toString(), init.method]).toEqual(['http://127.0.0.1:4321/uploads', 'POST'])
    expect(new Headers(init.headers).get('Content-Disposition')).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('笔记.txt')}`)
  })
})
