import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

const { paged } = await import('./browser')

describe('paged', () => {
  it('keeps a short snapshot whole', () => {
    expect(paged('- a\n- b', 100)).toEqual(['- a\n- b'])
  })

  it('cuts a long one at line ends, every page within the size', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `- text: line ${i}`)
    const pages = paged(lines.join('\n'), 40)
    expect(pages.join('\n')).toBe(lines.join('\n'))
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(40)
    expect(pages.every((p) => p.split('\n').every((l) => lines.includes(l)))).toBe(true)
  })

  it('cuts a line longer than a page into pieces', () => {
    const pages = paged(`- a\n${'x'.repeat(25)}\n- b`, 10)
    expect(pages).toEqual(['- a', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx\n- b'])
  })
})
