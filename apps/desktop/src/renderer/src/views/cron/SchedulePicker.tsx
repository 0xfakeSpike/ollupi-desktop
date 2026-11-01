// Picks when a task runs, the way people say it (once on 2 November at
// 09:00, every day at 09:00, every Monday…), instead of writing cron fields.

import type { Schedule } from '@ollupi/core'
import { Input, Select } from '@ollupi/ui'
import { useLocale, useT } from '../../i18n'
import { clock, weekdayName } from '../../i18n/format'

/** What the picker offers: once at a local date (YYYY-MM-DD) and time, or a
 * repeating schedule. A yearly schedule is only how a once task is run. */
export type Choice = { every: 'once'; day: string; hour: number; minute: number } | Exclude<Schedule, { every: 'year' }>

const everies: Choice['every'][] = ['once', 'hour', 'day', 'weekday', 'week', 'month']
/** Monday first, as a week is read; cron counts Sunday as 0. */
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const minutes = Array.from({ length: 60 }, (_, i) => i)
const dates = Array.from({ length: 31 }, (_, i) => i + 1)

export const defaultChoice: Choice = { every: 'day', hour: 9, minute: 0 }

const pad = (n: number) => String(n).padStart(2, '0')

/** A local date as an <input type="date"> holds it. */
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The local time a once choice names. */
export function onceTime(c: Extract<Choice, { every: 'once' }>): Date {
  const [y, mo, d] = c.day.split('-').map(Number)
  return new Date(y!, mo! - 1, d!, c.hour, c.minute)
}

/** The same time of day under another choice; once starts tomorrow. */
function switchTo(every: Choice['every'], c: Choice): Choice {
  const hour = 'hour' in c ? c.hour : 9
  const { minute } = c
  switch (every) {
    case 'once':
      return { every, day: dayOf(new Date(Date.now() + 86_400_000)), hour, minute }
    case 'hour':
      return { every, minute }
    case 'day':
    case 'weekday':
      return { every, hour, minute }
    case 'week':
      return { every, day: c.every === 'week' ? c.day : 1, hour, minute }
    case 'month':
      return { every, date: c.every === 'month' ? c.date : 1, hour, minute }
  }
}

export function SchedulePicker({ value, onChange }: { value: Choice; onChange(c: Choice): void }) {
  const m = useT().cron
  const locale = useLocale((s) => s.locale)
  const setTime = (text: string) => {
    const [h, min] = text.split(':').map(Number)
    if (value.every !== 'hour' && Number.isInteger(h) && Number.isInteger(min)) onChange({ ...value, hour: h!, minute: min! })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={m.schedule} className="w-32" value={value.every} onChange={(e) => onChange(switchTo(e.target.value as Choice['every'], value))}>
          {everies.map((e) => (
            <option key={e} value={e}>
              {m.every[e]}
            </option>
          ))}
        </Select>
        {value.every === 'once' && (
          <Input
            aria-label={m.onceDateLabel}
            type="date"
            className="w-40 tabular-nums"
            min={dayOf(new Date())}
            value={value.day}
            onChange={(e) => e.target.value && onChange({ ...value, day: e.target.value })}
          />
        )}
        {value.every === 'week' && (
          <Select aria-label={m.weekdayLabel} className="w-32" value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}>
            {weekdays.map((d) => (
              <option key={d} value={d}>
                {weekdayName(locale, d)}
              </option>
            ))}
          </Select>
        )}
        {value.every === 'month' && (
          <Select aria-label={m.dateLabel} className="w-28" value={value.date} onChange={(e) => onChange({ ...value, date: Number(e.target.value) })}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {m.dateOption(d)}
              </option>
            ))}
          </Select>
        )}
        {value.every === 'hour' ? (
          <Select aria-label={m.minutePast} className="w-28" value={value.minute} onChange={(e) => onChange({ ...value, minute: Number(e.target.value) })}>
            {minutes.map((n) => (
              <option key={n} value={n}>
                {m.atMinute(pad(n))}
              </option>
            ))}
          </Select>
        ) : (
          <Input aria-label={m.timeLabel} type="time" className="w-32 tabular-nums" value={clock(value.hour, value.minute)} onChange={(e) => setTime(e.target.value)} />
        )}
      </div>
      {value.every === 'month' && value.date > 28 && <p className="text-small text-fg-subtle">{m.shortMonths(value.date)}</p>}
      {value.every === 'once' && onceTime(value) <= new Date() && <p className="text-small text-danger">{m.pastTime}</p>}
    </div>
  )
}
