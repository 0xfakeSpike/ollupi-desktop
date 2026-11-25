import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from '../gateway/connection'
import { attachmentFile } from './attachments'

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
    expect(init.headers).toEqual({ Authorization: 'Bearer secret' })
    expect([file.name, file.type, await file.text()]).toEqual(['notes.txt', 'text/plain', 'ship on friday\n'])
  })

  it('refuses while the backend is not ready, and when the gateway says no', async () => {
    useConnection.setState({ backend: { status: 'starting' } })
    await expect(attachmentFile('t', { id: 'a2', kind: 'file', name: 'n', mimeType: 'text/plain', size: 1, file: 'f', tokens: 1 })).rejects.toThrow()
    useConnection.setState({ backend: { status: 'ready', url: 'ws://127.0.0.1:4321/', token: 'secret', profile: 'default', version: '1' } })
    vi.stubGlobal('fetch', async () => new Response('no such attachment', { status: 404 }))
    await expect(attachmentFile('t', { id: 'a3', kind: 'file', name: 'n', mimeType: 'text/plain', size: 1, file: 'f', tokens: 1 })).rejects.toThrow(/404/)
  })
})
