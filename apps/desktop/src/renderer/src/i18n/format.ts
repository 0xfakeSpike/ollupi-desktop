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

export function duration(m: Messages, startIso: string, endIso: string | null | undefined, now = Date.now()): string {
  const d = span(startIso, endIso, now)
  if (!d) return ''
  if ('ms' in d) return m.common.span.ms(d.ms)
  if ('digits' in d) return m.common.span.s(d.s.toFixed(d.digits))
  return m.common.span.m(d.m, d.s)
}

export function usageLine(m: Messages, u: Usage): string {
  if (u.inputTokens + u.outputTokens === 0) return ''
  const [input, output] = [formatTokens(u.inputTokens), formatTokens(u.outputTokens)]
  return u.cachedInputTokens ? m.common.usage.lineCached(input, formatTokens(u.cachedInputTokens), output) : m.common.usage.line(input, output)
}

/** The server sets preview to the first line of the first turn's input when
 * that turn starts; before then the thread has no title of its own. */
export function threadTitle(m: Messages, thread: Pick<ThreadRow, 'preview'>): string {
  return thread.preview || m.common.newThread
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
  }
}
