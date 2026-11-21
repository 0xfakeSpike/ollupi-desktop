import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notify, useNotices } from './notices'

const shown = () => useNotices.getState().notices.map((n) => n.message)

describe('notices', () => {
  beforeEach(() => useNotices.setState({ notices: [] }))
  afterEach(() => vi.useRealTimers())

  it('clears an info notice after four seconds', () => {
    vi.useFakeTimers()
    notify('Saved', 'info')
    vi.advanceTimersByTime(3_999)
    expect(shown()).toEqual(['Saved'])
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual([])
  })

  it('clears a failure after a minute, since one names no item', () => {
    vi.useFakeTimers()
    notify('Sending your message failed')
    vi.advanceTimersByTime(59_999)
    expect(shown()).toEqual(['Sending your message failed'])
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual([])
  })

  it('clears a failure earlier when it is dismissed', () => {
    vi.useFakeTimers()
    notify('Failed')
    const id = notify('Another failure')
    useNotices.getState().dismiss(id)
    expect(shown()).toEqual(['Failed'])
  })

  it('keeps the three newest', () => {
    vi.useFakeTimers()
    for (const message of ['one', 'two', 'three', 'four']) notify(message)
    expect(shown()).toEqual(['two', 'three', 'four'])
  })
})
