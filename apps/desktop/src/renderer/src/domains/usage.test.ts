import { describe, expect, it } from 'vitest'
import type { UsageRow } from '@ollupi/protocol'
import { buildUsage, tokensOf, usageRange } from './usage'

const row = (key: string, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, cacheWriteInputTokens = 0): UsageRow => ({
  key,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  cacheWriteInputTokens,
})

describe('usage', () => {
  it('counts a call as its input and output, the input already holding what was cached', () => {
    expect(tokensOf(row('d', 100, 20, 60, 10))).toBe(120)
  })

  it('asks for the last days in the reader’s clock, today included', () => {
    const now = new Date(2026, 10, 21, 15, 30)
    const period = usageRange(3, now)
    expect(period.keys).toEqual(['2026-11-19', '2026-11-20', '2026-11-21'])
    expect(period.from).toBe(new Date(2026, 10, 19).toISOString())
    expect(period.to).toBe(new Date(2026, 10, 22).toISOString())
    expect(period.offsetMinutes).toBe(-now.getTimezoneOffset())
  })

  it('gives every day of the period a row, a quiet day all zeroes', () => {
    const keys = ['2026-11-19', '2026-11-20', '2026-11-21']
    const usage = buildUsage(3, keys, [[row('2026-11-21', 30, 5)], [], []])
    expect(usage.day.map((d) => d.key)).toEqual(keys)
    expect(usage.day[0]).toEqual(row('2026-11-19'))
    expect(usage.day[2]).toEqual(row('2026-11-21', 30, 5))
  })

  it('adds the parts into one total without counting the cached input twice', () => {
    const keys = ['2026-11-20', '2026-11-21']
    const usage = buildUsage(2, keys, [
      [row('2026-11-20', 40, 10, 15, 5), row('2026-11-21', 60, 20, 30, 10)],
      [row('w1', 100, 30, 45, 15)],
      [row('m1', 100, 30, 45, 15)],
    ])
    expect(usage.totals).toEqual({ input: 100, cached: 45, cacheWrite: 15, output: 30, total: 130 })
  })

  it('lists workspaces and models busiest first', () => {
    const usage = buildUsage(1, ['2026-11-21'], [
      [row('2026-11-21', 10, 1)],
      [row('small', 5), row('big', 50), row('mid', 20)],
      [row('b', 7), row('a', 7)],
    ])
    expect(usage.workspace.map((r) => r.key)).toEqual(['big', 'mid', 'small'])
    // A tie keeps a stable order, so the list does not jump about.
    expect(usage.model.map((r) => r.key)).toEqual(['a', 'b'])
  })
})
