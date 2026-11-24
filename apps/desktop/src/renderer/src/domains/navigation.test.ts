import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_BROWSER } from '../../../shared/ipc'
import { forgetPanel, go, handOverPanel, openPanel, resetForProfile, showFile, shownFile, shownPanel, startNavigation, togglePanel, useNavigation } from './navigation'

// A window's sessionStorage: kept across a reload, gone with the window.
const kept = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
})

const shown = () => shownPanel(useNavigation.getState())
const file = () => shownFile(useNavigation.getState())

describe('navigation', () => {
  beforeEach(() => {
    kept.clear()
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined }, panels: {} })
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
    go({ kind: 'settings', tab: 'general' })
    // A reload: the store starts over.
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined } })
    startNavigation()
    expect(useNavigation.getState().screen).toEqual({ kind: 'draft', workspaceId: undefined })

    kept.clear()
    startNavigation()
    expect(useNavigation.getState().screen).toEqual({ kind: 'draft', workspaceId: undefined })
  })

  it('drops every conversation-level choice when the profile changes', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('files')
    useNavigation.setState({ environment: 'env1', model: 'openai/gpt', approval: 'never', focus: { threadId: 'th1', itemId: 'it1' } })
    resetForProfile()
    expect(useNavigation.getState()).toMatchObject({
      screen: { kind: 'draft', workspaceId: undefined },
      environment: undefined,
      model: undefined,
      approval: undefined,
      panels: {},
      focus: undefined,
    })
    expect(kept.has('ollupi.openThread')).toBe(false)
  })
})

describe('the panel beside the conversation', () => {
  beforeEach(() => {
    useNavigation.setState({ screen: { kind: 'draft', workspaceId: undefined }, panels: {} })
  })

  it('shows a panel only beside the conversation that opened it', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('files')
    expect(shown()).toBe('files')

    go({ kind: 'thread', threadId: 'th2' })
    expect(shown()).toBeUndefined()

    // Back where it was opened, the panel is still open.
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBe('files')
  })

  it("keeps each conversation's own panel, never another's", () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('tasks')
    go({ kind: 'thread', threadId: 'th2' })
    openPanel('browser')

    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBe('tasks')
    go({ kind: 'thread', threadId: 'th2' })
    expect(shown()).toBe('browser')
  })

  it('closes only the panel of the conversation on screen', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('files')
    go({ kind: 'thread', threadId: 'th2' })
    openPanel('files')
    togglePanel('files')
    expect(shown()).toBeUndefined()

    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBe('files')
  })

  it('keeps the file each conversation opened in its Files panel', () => {
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBeUndefined()
    // A path in the conversation opens its file, and the Files panel with it.
    showFile('ws1', 'src/a.ts')
    expect(shown()).toBe('files')
    expect(file()).toEqual({ workspaceId: 'ws1', path: 'src/a.ts' })

    go({ kind: 'thread', threadId: 'th2' })
    openPanel('files')
    expect(file()).toBeUndefined()
    showFile('ws1', 'src/b.ts')
    expect(file()).toEqual({ workspaceId: 'ws1', path: 'src/b.ts' })

    go({ kind: 'thread', threadId: 'th1' })
    expect(file()).toEqual({ workspaceId: 'ws1', path: 'src/a.ts' })
  })

  it('finds the file again when the Files panel reopens', () => {
    go({ kind: 'thread', threadId: 'th1' })
    showFile('ws1', 'src/a.ts')
    togglePanel('files')
    expect(shown()).toBeUndefined()

    openPanel('files')
    expect(shown()).toBe('files')
    expect(file()).toEqual({ workspaceId: 'ws1', path: 'src/a.ts' })
  })

  it("carries a draft's panel on beside the thread it starts", () => {
    go({ kind: 'draft', workspaceId: undefined })
    openPanel('browser')
    expect(shown()).toBe('browser')

    // Sending the draft's first message shows its thread.
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBeUndefined()
    handOverPanel(DRAFT_BROWSER, 'th1')
    expect(shown()).toBe('browser')
  })

  it('leaves no panel behind a thread that went away', () => {
    go({ kind: 'thread', threadId: 'th1' })
    openPanel('terminal')
    forgetPanel('th1')
    go({ kind: 'thread', threadId: 'th1' })
    expect(shown()).toBeUndefined()
  })

  it('opens no panel on a screen with no conversation beside it', () => {
    go({ kind: 'search' })
    openPanel('files')
    expect(useNavigation.getState().panels).toEqual({})
  })
})
