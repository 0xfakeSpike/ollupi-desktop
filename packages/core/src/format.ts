// Small display formatters shared by every view.

import type { Usage } from '@ollupi/protocol'

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function usageLine(u: Usage | undefined): string {
  if (!u || u.inputTokens + u.outputTokens === 0) return ''
  const cached = u.cachedInputTokens ? ` (${formatTokens(u.cachedInputTokens)} cached)` : ''
  return `${formatTokens(u.inputTokens)} in${cached} · ${formatTokens(u.outputTokens)} out`
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d`
  return new Date(t).toLocaleDateString()
}

export function duration(startIso: string, endIso: string | undefined, now = Date.now()): string {
  const ms = (endIso ? Date.parse(endIso) : now) - Date.parse(startIso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
