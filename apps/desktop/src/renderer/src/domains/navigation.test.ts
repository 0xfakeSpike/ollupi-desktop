import { beforeEach, describe, expect, it, vi } from 'vitest'
import { go, startNavigation, useNavigation } from './navigation'

// A window's sessionStorage: kept across a reload, gone with the window.
const kept = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
})

describe('navigation', () => {
  beforeEach(() => {
    kept.clear()
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined } })
  })

  it('comes back to the conversation the window showed before a reload', () => {
    go({ kind: 'thread', threadId: 'th1' })
    // What a reload leaves: the store starts over, the storage does not.
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined } })
    startNavigation()
    expect(useNavigation.getState().screen).toEqual({ kind: 'thread', threadId: 'th1' })
  })

  it('starts on a new conversation after any other screen, or with nothing kept', () => {
    go({ kind: 'thread', threadId: 'th1' })
    go({ kind: 'settings' })
    // A reload: the store starts over.
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined } })
    startNavigation()
    expect(useNavigation.getState().screen).toEqual({ kind: 'draft', workspaceId: undefined })

    kept.clear()
    startNavigation()
    expect(useNavigation.getState().screen).toEqual({ kind: 'draft', workspaceId: undefined })
  })
})
