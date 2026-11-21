// Token use over a period, as ollupi recorded it: the engine derives a row
// from every model call it makes, keeping the workspace, thread and model it
// belonged to. This side only reads. A query counts one dimension at a time,
// so the days, the workspaces and the models are three calls over the same
// period; their sums agree because they cover the same rows.

import { errorMessage } from '@ollupi/client'
import type { UsageGroup, UsageRow } from '@ollupi/protocol'
import { useEffect, useState } from 'react'
import { gateway, useConnection } from '../gateway/connection'

/** The tokens a row counts. Input already holds the cached and the
 * cache-written part, so adding either again would count it twice. */
export const tokensOf = (row: UsageRow): number => row.inputTokens + row.outputTokens

export interface UsageTotals {
  /** Input as the provider bills it: the uncached part, the cached part and
   * the part written to the cache. */
  input: number
  cached: number
  cacheWrite: number
  output: number
  /** Input and output together. */
  total: number
}

export interface Usage {
  /** The days the rows cover, today and the days before it. */
  days: number
  /** One row per local day, oldest first; a day without a call is all
   * zeroes, so the chart has a bar for every day asked for. */
  day: UsageRow[]
  /** Most tokens first. Keys are workspace ids, the empty one for calls
   * outside any workspace. */
  workspace: UsageRow[]
  /** Most tokens first. Keys are model ids, the empty one for calls that
   * named none. */
  model: UsageRow[]
  totals: UsageTotals
}

export type UsageState =
  | { status: 'loading' }
  /** The backend that records the rows is not running, so nothing can be
   * asked. */
  | { status: 'offline' }
  | { status: 'failed'; error: string }
  | { status: 'ready'; usage: Usage }

const pad = (n: number) => String(n).padStart(2, '0')

/** The local day a Date falls in, as the engine writes it after its offset. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export interface Range {
  /** The period's start and its end, exclusive, as instants the engine
   * compares its UTC timestamps with. */
  from: string
  to: string
  /** How far the caller's clocks are ahead of UTC, so each call counts in
   * the day the person was in. */
  offsetMinutes: number
  /** The local days covered, oldest first. */
  keys: string[]
}

/** The last `days` local days, today included, as the half-open instant range
 * a query asks the engine for and their keys as the engine groups them. */
export function usageRange(days: number, now = new Date()): Range {
  const beginning = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(beginning(-i)))
  return {
    from: beginning(-(days - 1)).toISOString(),
    to: beginning(1).toISOString(),
    offsetMinutes: -now.getTimezoneOffset(),
    keys,
  }
}

function query(groupBy: UsageGroup, period: Range): Promise<UsageRow[]> {
  return gateway()
    .call('usage/query', { from: period.from, to: period.to, groupBy, offsetMinutes: period.offsetMinutes })
    .then((r) => r.data)
}

const EMPTY: Omit<UsageRow, 'key'> = { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 }

export function buildUsage(days: number, keys: string[], rows: [UsageRow[], UsageRow[], UsageRow[]]): Usage {
  const [day, workspace, model] = rows
  const found = new Map(day.map((r) => [r.key, r]))
  const everyDay = keys.map((key) => found.get(key) ?? { key, ...EMPTY })
  const totals = everyDay.reduce<UsageTotals>(
    (sum, r) => ({
      input: sum.input + r.inputTokens,
      cached: sum.cached + r.cachedInputTokens,
      cacheWrite: sum.cacheWrite + r.cacheWriteInputTokens,
      output: sum.output + r.outputTokens,
      total: sum.total + tokensOf(r),
    }),
    { input: 0, cached: 0, cacheWrite: 0, output: 0, total: 0 },
  )
  const most = (list: UsageRow[]) => list.slice().sort((a, b) => tokensOf(b) - tokensOf(a) || a.key.localeCompare(b.key))
  return { days, day: everyDay, workspace: most(workspace), model: most(model), totals }
}

/** The last `days` days of token use, today included. Ready data carries the
 * period it covers, so a switch of period shows loading rather than the days
 * that came before. refresh asks again. */
export function useUsage(days: number): { usage: UsageState; refresh(): void } {
  const [usage, setUsage] = useState<UsageState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const connected = useConnection((s) => s.gateway === 'connected')
  const down = useConnection((s) => s.backend.status === 'failed' || s.backend.status === 'stopped')

  useEffect(() => {
    if (!connected) {
      setUsage(down ? { status: 'offline' } : { status: 'loading' })
      return
    }
    let current = true
    const period = usageRange(days)
    Promise.all([query('day', period), query('workspace', period), query('model', period)])
      .then((rows) => {
        if (current) setUsage({ status: 'ready', usage: buildUsage(days, period.keys, rows) })
      })
      .catch((err: unknown) => {
        if (current) setUsage({ status: 'failed', error: errorMessage(err) })
      })
    return () => {
      current = false
    }
  }, [days, attempt, connected, down])

  return { usage, refresh: () => setAttempt((n) => n + 1) }
}
