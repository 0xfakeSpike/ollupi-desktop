// Display formatting shared by every view.

import type { Usage } from '@ollupi/protocol'

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** How long ago (or until) a time is, at the precision a list shows:
 * the language-neutral part of "5m", "in 2h" or a date. */
export type Elapsed =
  | { unit: 'now' }
  | { unit: 'soon' }
  | { unit: 'minute' | 'hour' | 'day'; n: number; future: boolean }
  | { unit: 'date'; at: number }

export function elapsed(iso: string, now = Date.now()): Elapsed | undefined {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  const s = Math.round((now - t) / 1000)
  const future = s < 0
  const abs = Math.abs(s)
  if (abs < 60) return future ? { unit: 'soon' } : { unit: 'now' }
  if (abs < 3600) return { unit: 'minute', n: Math.round(abs / 60), future }
  if (abs < 86400) return { unit: 'hour', n: Math.round(abs / 3600), future }
  if (future || abs < 30 * 86400) return { unit: 'day', n: Math.round(abs / 86400), future }
  return { unit: 'date', at: t }
}

/** A duration split the way it is shown: milliseconds under a second,
 * seconds (one decimal under ten) under a minute, else minutes and seconds. */
export type Span = { ms: number } | { s: number; digits: 0 | 1 } | { m: number; s: number }

export function span(startIso: string, endIso: string | null | undefined, now = Date.now()): Span | undefined {
  const ms = (endIso ? Date.parse(endIso) : now) - Date.parse(startIso)
  if (!Number.isFinite(ms) || ms < 0) return undefined
  if (ms < 1000) return { ms }
  const s = ms / 1000
  if (s < 60) return { s, digits: s < 10 ? 1 : 0 }
  return { m: Math.floor(s / 60), s: Math.round(s % 60) }
}
