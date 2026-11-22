import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_BROWSER } from '../../../shared/ipc'
import { go, handOverBrowser, openPanel, shownPanel, startNavigation, useNavigation } from './navigation'

// A window's sessionStorage: kept across a reload, gone with the window.
const kept = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
})

const shown = () => shownPanel(useNavigation.getState())

describe('navigation', () => {
  beforeEach(() => {
    kept.clear()
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined }, panel: undefined })
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

describe('the panel beside the conversation', () => {
  beforeEach(() => {
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined }, panel: undefined })
  })

  it('shows a browser only beside the conversation whose tabs it is', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('browser')
    expect(shown()).toBe('browser')

    go({ kind: 'thread', threadId: 'th2' })
    expect(shown()).toBeUndefined()

    // Back where it was opened, the browser is still open.
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBe('browser')
  })

  it('gives another conversation a browser of its own', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('browser')
    go({ kind: 'thread', threadId: 'th2' })
    openPanel('browser')
    expect(shown()).toBe('browser')

    // The first conversation's browser closed when the second one opened its own.
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBeUndefined()
  })

  it('leaves the panels that read the conversation on screen open across threads', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('tasks')
    go({ kind: 'thread', threadId: 'th2' })
    expect(shown()).toBe('tasks')
  })

  it("carries a draft's browser on beside the thread it starts", () => {
    go({ kind: 'draft', workspaceId: undefined })
    openPanel('browser')
    expect(shown()).toBe('browser')

    // Sending the draft's first message shows its thread.
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBeUndefined()
    handOverBrowser(DRAFT_BROWSER, 'th1')
    expect(shown()).toBe('browser')
  })
})
