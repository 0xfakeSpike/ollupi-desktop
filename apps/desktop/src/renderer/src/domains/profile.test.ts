import { beforeEach, describe, expect, it, vi } from 'vitest'

const desktop = vi.hoisted(() => ({
  list: vi.fn(),
  select: vi.fn(async () => {}),
  context: vi.fn(),
}))

vi.hoisted(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
})

vi.mock('../platform/desktop', () => ({
  desktop: {
    profile: { list: desktop.list, select: desktop.select },
    presence: { context: desktop.context },
  },
}))

import { profileDomain, useProfile } from './profile'

describe('profile switching', () => {
  beforeEach(() => {
    desktop.list.mockReset()
    desktop.select.mockReset()
    desktop.select.mockResolvedValue(undefined)
    useProfile.setState({ list: [], current: 'old' })
  })

  it('reconnects when config replaces the saved profile', async () => {
    desktop.list.mockResolvedValue({
      current: 'new',
      data: [{ id: 'new', name: '', color: 'stone' }],
    })
    await expect(profileDomain.sync?.({} as never)).rejects.toThrow('profile changed')
    expect(desktop.select).toHaveBeenCalledWith('new')
    expect(useProfile.getState().current).toBe('new')
  })
})
