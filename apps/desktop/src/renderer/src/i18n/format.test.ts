import { describe, expect, it } from 'vitest'
import type { Messages } from '.'
import { clockTime } from './format'
import * as common from './messages/common'

// Only the common words are read; the rest of the catalog is not needed here.
const en = { common: common.en } as unknown as Messages
const zh = { common: common.zh } as unknown as Messages
// Local times, so the day boundaries are the reader's own.
const now = new Date(2026, 10, 13, 9, 30)
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString()

describe('clockTime', () => {
  it('says only the time today', () => {
    expect(clockTime(en, 'en', at(2026, 10, 13, 8, 5), now)).toBe('08:05')
  })
  it('says yesterday and the time', () => {
    expect(clockTime(en, 'en', at(2026, 10, 12, 23, 59), now)).toBe('Yesterday 23:59')
    expect(clockTime(zh, 'zh-CN', at(2026, 10, 12, 14, 32), now)).toBe('昨天 14:32')
  })
  it('says the day this year, and the year before that', () => {
    expect(clockTime(zh, 'zh-CN', at(2026, 10, 1, 7, 0), now)).toBe('11月1日 07:00')
    expect(clockTime(en, 'en', at(2025, 11, 31, 18, 45), now)).toBe('Dec 31, 2025 18:45')
  })
  it('says nothing for a time it cannot read', () => {
    expect(clockTime(en, 'en', 'not a time', now)).toBe('')
  })
})
