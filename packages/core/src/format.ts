// Display formatting shared by every view.

import type { Usage } from '@ollupi/protocol'

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function usageLine(u: Usage): string {
  if (u.inputTokens + u.outputTokens === 0) return ''
  const cached = u.cachedInputTokens ? ` (${formatTokens(u.cachedInputTokens)} cached)` : ''
  return `${formatTokens(u.inputTokens)} in${cached} · ${formatTokens(u.outputTokens)} out`
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.round((now - t) / 1000)
  if (s < 0) return inFuture(-s)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 30 * 86400) return `${Math.round(s / 86400)}d`
  return new Date(t).toLocaleDateString()
}

function inFuture(s: number): string {
  if (s < 60) return 'in under a minute'
  if (s < 3600) return `in ${Math.round(s / 60)}m`
  if (s < 86400) return `in ${Math.round(s / 3600)}h`
  return `in ${Math.round(s / 86400)}d`
}

export function duration(startIso: string, endIso: string | undefined, now = Date.now()): string {
  const ms = (endIso ? Date.parse(endIso) : now) - Date.parse(startIso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
