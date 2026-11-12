import { beforeEach, describe, expect, it, vi } from 'vitest'

// Before the modules load: a draft knows the files that go with it, and those
// live in platform/desktop, which wants a window.
vi.hoisted(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
})

import { addDraftFiles, draftOf, forgetDraft, NEW_CONVERSATION, reopenDraft, sentDraft, setDraftText, startDrafts, useDrafts } from './drafts'

// A window's sessionStorage: kept across a reload, gone with the window.
const kept = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
})

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })
const names = (key: string) => draftOf(key).attachments.map((a) => a.file.name)

/** What a reload leaves: the drafts in memory start over, the window's
 * storage does not. */
const reload = () => {
  useDrafts.setState({ drafts: {} })
  startDrafts()
}

describe('drafts', () => {
  beforeEach(() => {
    kept.clear()
    useDrafts.setState({ drafts: {} })
  })

  it("keeps each box's own text as screens change", () => {
    setDraftText('th1', 'half a thought')
    setDraftText('th2', 'another one')
    setDraftText(NEW_CONVERSATION, 'a new task')
    // Leaving th1 for th2 and coming back.
    expect(draftOf('th1').text).toBe('half a thought')
    expect(draftOf('th2').text).toBe('another one')
    expect(draftOf(NEW_CONVERSATION).text).toBe('a new task')
  })

  it('keeps the text — but not the files — across a reload', () => {
    setDraftText('th1', 'half a thought')
    addDraftFiles('th1', [file('a.txt')])
    reload()
    expect(draftOf('th1').text).toBe('half a thought')
    expect(names('th1')).toEqual([])
  })

  it('takes what was sent out of the box, keeping what was typed meanwhile', () => {
    setDraftText('th1', 'first')
    addDraftFiles('th1', [file('a.txt')])
    const sent = draftOf('th1')

    setDraftText('th1', 'first, and one more')
    addDraftFiles('th1', [file('b.txt')])
    sentDraft('th1', sent)

    expect(draftOf('th1').text).toBe('first, and one more')
    expect(names('th1')).toEqual(['b.txt'])
  })

  it('empties the box when nothing was typed while it went', () => {
    setDraftText('th1', 'first')
    addDraftFiles('th1', [file('a.txt')])
    sentDraft('th1', draftOf('th1'))
    expect(draftOf('th1')).toEqual({ text: '', attachments: [] })
  })

  it('forgets a draft whose conversation is gone', () => {
    setDraftText('th1', 'half a thought')
    forgetDraft('th1')
    reload()
    expect(draftOf('th1').text).toBe('')
  })

  it('gives a sent message back to edit before what the box held', () => {
    setDraftText('th2', 'typed meanwhile')
    addDraftFiles('th2', [file('a.txt')])
    reopenDraft('th2', 'the message', [file('b.txt')])
    expect(draftOf('th2').text).toBe('the message\n\ntyped meanwhile')
    expect(names('th2')).toEqual(['a.txt', 'b.txt'])
    expect(useDrafts.getState().reopened.th2).toBe(1)

    forgetDraft('th3')
    reopenDraft('th3', 'again', [])
    expect(draftOf('th3').text).toBe('again')
  })
})
