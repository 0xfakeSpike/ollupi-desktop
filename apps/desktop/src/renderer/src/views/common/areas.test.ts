import { describe, expect, it } from 'vitest'
import { areaFields } from './areas'

const ws = (id: string, createdAt: string, kind: 'project' | 'hub' = 'project') => ({ id, kind, createdAt })

describe('areaFields', () => {
  it('gives up to six workspaces six different fields', () => {
    const list = Array.from({ length: 6 }, (_, i) => ws(`w${i}`, `2026-01-0${i + 1}T00:00:00Z`))
    expect(new Set(areaFields(list).values()).size).toBe(6)
  })

  it('keeps the fields of earlier workspaces when one is added, in any order', () => {
    const before = [ws('b', '2026-01-02T00:00:00Z'), ws('a', '2026-01-01T00:00:00Z')]
    const after = [ws('c', '2026-01-03T00:00:00Z'), ...before]
    const was = areaFields(before)
    const now = areaFields(after)
    expect(now.get('a')).toBe(was.get('a'))
    expect(now.get('b')).toBe(was.get('b'))
    expect(new Set(now.values()).size).toBe(3)
  })

  it('gives the hub none', () => {
    expect(areaFields([ws('h', '2026-01-01T00:00:00Z', 'hub')]).has('h')).toBe(false)
  })
})
