import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  select: vi.fn(async () => {}),
  context: vi.fn(),
  backend: { status: 'ready', url: 'ws://127.0.0.1:1/', token: 's.new', profile: 'new', version: '' },
}))

vi.hoisted(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
})

vi.mock('../platform/desktop', () => ({
  desktop: {
    profile: { select: h.select },
    presence: { context: h.context },
  },
}))
vi.mock('../gateway/connection', () => ({ useConnection: { getState: () => ({ backend: h.backend }) }, gateway: () => undefined }))

import { RpcError } from '@ollupi/client'
import { ErrorCode } from '@ollupi/protocol'
import { profileDomain, useProfile } from './profile'

function client(list: () => Promise<unknown>) {
  return {
    snapshot: async () => ({ result: await list(), newer: [] }),
    call: async () => ({ user: { id: 'new', name: 'Me' } }),
  } as never
}

describe('profiles', () => {
  beforeEach(() => {
    useProfile.setState({ list: [], current: 'old', operator: false })
  })

  it('acts as the profile the backend names, and lists every one for the operator', async () => {
    await profileDomain.sync?.(client(async () => ({ data: [{ id: 'work', name: 'Work' }, { id: 'new', name: '' }], seq: 3 })))
    expect(useProfile.getState()).toMatchObject({ current: 'new', operator: true, list: [{ id: 'new', name: '' }, { id: 'work', name: 'Work' }] })
  })

  it('knows only its own profile on a connection that is not the operator’s', async () => {
    await profileDomain.sync?.(client(async () => Promise.reject(new RpcError(ErrorCode.forbidden, 'forbidden'))))
    expect(useProfile.getState()).toMatchObject({ current: 'new', operator: false, list: [{ id: 'new', name: 'Me' }] })
  })
})
