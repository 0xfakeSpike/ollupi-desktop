// Picks how often a task repeats, the way people say it (every day at
// 09:00, every Monday…), instead of writing cron fields.

import type { Schedule } from '@ollupi/core'
import { Input, Select } from '@ollupi/ui'
import { useLocale, useT } from '../../i18n'
import { clock, weekdayName } from '../../i18n/format'

const everies: Schedule['every'][] = ['hour', 'day', 'weekday', 'week', 'month']
/** Monday first, as a week is read; cron counts Sunday as 0. */
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const minutes = Array.from({ length: 60 }, (_, i) => i)
const dates = Array.from({ length: 31 }, (_, i) => i + 1)

export const defaultSchedule: Schedule = { every: 'day', hour: 9, minute: 0 }

/** The same time of day under another repetition. */
function switchTo(every: Schedule['every'], s: Schedule): Schedule {
  const hour = 'hour' in s ? s.hour : 9
  const { minute } = s
  switch (every) {
    case 'hour':
      return { every, minute }
    case 'day':
    case 'weekday':
      return { every, hour, minute }
    case 'week':
      return { every, day: s.every === 'week' ? s.day : 1, hour, minute }
    case 'month':
      return { every, date: s.every === 'month' ? s.date : 1, hour, minute }
  }
}

export function SchedulePicker({ value, onChange }: { value: Schedule; onChange(s: Schedule): void }) {
  const m = useT().cron
  const locale = useLocale((s) => s.locale)
  const pad = (n: number) => String(n).padStart(2, '0')
  const setTime = (text: string) => {
    const [h, min] = text.split(':').map(Number)
    if (value.every !== 'hour' && Number.isInteger(h) && Number.isInteger(min)) onChange({ ...value, hour: h!, minute: min! })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={m.schedule} className="w-32" value={value.every} onChange={(e) => onChange(switchTo(e.target.value as Schedule['every'], value))}>
          {everies.map((e) => (
            <option key={e} value={e}>
              {m.every[e]}
            </option>
          ))}
        </Select>
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
    </div>
  )
}
