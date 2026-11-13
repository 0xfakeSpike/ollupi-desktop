// Core's language-neutral values worded in the current language.

import { elapsed, formatTokens, span, type Schedule } from '@ollupi/core'
import type { ThreadRow, Usage } from '@ollupi/protocol'
import type { Messages } from '.'
import type { Locale } from './locale'

export function relativeTime(m: Messages, locale: Locale, iso: string, now = Date.now()): string {
  const e = elapsed(iso, now)
  if (!e) return ''
  switch (e.unit) {
    case 'now':
      return m.common.time.now
    case 'soon':
      return m.common.time.soon
    case 'date':
      return new Date(e.at).toLocaleDateString(locale)
    default:
      return (e.future ? m.common.time.in : m.common.time.ago)[e.unit](e.n)
  }
}

/** When a message was written, as a clock reads it: the time alone today,
 * "Yesterday" and the time, the day and the time this year, the full date
 * before. */
export function clockTime(m: Messages, locale: Locale, iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return m.common.time.yesterday(time)
  const date = at.toLocaleDateString(locale, at.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
  return `${date} ${time}`
}

/** The same moment in full, for a tooltip: weekday, date and time. */
export function fullTime(locale: Locale, iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' })
}

export function duration(m: Messages, startIso: string, endIso: string | null | undefined, now = Date.now()): string {
  const d = span(startIso, endIso, now)
  if (!d) return ''
  if ('ms' in d) return m.common.span.ms(d.ms)
  if ('digits' in d) return m.common.span.s(d.s.toFixed(d.digits))
  return m.common.span.m(d.m, d.s)
}

/** Input counts the cached part and the part written to the cache; each
 * is named only when there is some. */
export function usageLine(m: Messages, u: Usage): string {
  if (u.inputTokens + u.outputTokens === 0) return ''
  const t = m.common.usage
  return [
    t.input(formatTokens(u.inputTokens)),
    u.cachedInputTokens > 0 && t.cached(formatTokens(u.cachedInputTokens)),
    u.cacheWriteInputTokens > 0 && t.cacheWrite(formatTokens(u.cacheWriteInputTokens)),
    t.output(formatTokens(u.outputTokens)),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A thread's title is what the app gave it when starting it (from the
 * first message) or the person renamed it to; it may be empty. */
export function threadTitle(m: Messages, thread: Pick<ThreadRow, 'title'>): string {
  return thread.title || m.common.newThread
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A time of day as the schedule controls show it, 24-hour. */
export const clock = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`

/** A cron weekday (0 is Sunday) named in the locale. 2023-01-01 was a Sunday. */
export function weekdayName(locale: Locale, day: number, style: 'long' | 'short' = 'long'): string {
  return new Date(2023, 0, 1 + day).toLocaleDateString(locale, { weekday: style })
}

export function describeSchedule(m: Messages, locale: Locale, s: Schedule): string {
  const d = m.cron.describe
  switch (s.every) {
    case 'hour':
      return d.hour(pad(s.minute))
    case 'day':
      return d.day(clock(s.hour, s.minute))
    case 'weekday':
      return d.weekday(clock(s.hour, s.minute))
    case 'week':
      return d.week(weekdayName(locale, s.day, m.cron.describeWeekday), clock(s.hour, s.minute))
    case 'month':
      return d.month(s.date, clock(s.hour, s.minute))
    case 'year':
      return d.year(monthDay(locale, s.month, s.date), clock(s.hour, s.minute))
  }
}

/** A date without its year: June 1 / 6月1日. */
export function monthDay(locale: Locale, month: number, date: number): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(new Date(2000, month - 1, date))
}

const sizeUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

/** A file's size in the largest unit that keeps it at 1 or more. */
export function fileSize(locale: Locale, bytes: number): string {
  let n = bytes
  let i = 0
  while (n >= 1024 && i < sizeUnits.length - 1) {
    n /= 1024
    i++
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: sizeUnits[i], unitDisplay: 'short', maximumFractionDigits: i ? 1 : 0 }).format(n)
}
