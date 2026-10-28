// Schedules a person picks (every hour, day, weekday, week or month at a
// time) and the cron specs ollupi runs them by: five fields (minute hour
// day-of-month month day-of-week) or a descriptor, in the backend's local
// time (cron.New with time.Local), parsed by robfig/cron.

export type Schedule =
  | { every: 'hour'; minute: number }
  | { every: 'day'; hour: number; minute: number }
  | { every: 'weekday'; hour: number; minute: number }
  /** day: 0 is Sunday, as cron counts. */
  | { every: 'week'; day: number; hour: number; minute: number }
  /** A month without the date (the 31st in April) is skipped. */
  | { every: 'month'; date: number; hour: number; minute: number }

export function cronSpec(s: Schedule): string {
  switch (s.every) {
    case 'hour':
      return `${s.minute} * * * *`
    case 'day':
      return `${s.minute} ${s.hour} * * *`
    case 'weekday':
      return `${s.minute} ${s.hour} * * 1-5`
    case 'week':
      return `${s.minute} ${s.hour} * * ${s.day}`
    case 'month':
      return `${s.minute} ${s.hour} ${s.date} * *`
  }
}

const descriptors: Record<string, Schedule> = {
  '@hourly': { every: 'hour', minute: 0 },
  '@daily': { every: 'day', hour: 0, minute: 0 },
  '@midnight': { every: 'day', hour: 0, minute: 0 },
  '@weekly': { every: 'week', day: 0, hour: 0, minute: 0 },
  '@monthly': { every: 'month', date: 1, hour: 0, minute: 0 },
}

/** The schedule a spec describes, when it is one of these shapes; other
 * specs (ranges, steps, several values, months) have none. */
export function scheduleOf(spec: string): Schedule | undefined {
  const d = descriptors[spec.trim()]
  if (d) return d
  const f = spec.trim().split(/\s+/)
  if (f.length !== 5) return undefined
  const [min, hour, dom, month, dow] = f as [string, string, string, string, string]
  const num = (v: string, lo: number, hi: number) => (/^\d{1,2}$/.test(v) && +v >= lo && +v <= hi ? +v : undefined)
  const minute = num(min, 0, 59)
  if (minute === undefined || month !== '*') return undefined
  if (hour === '*') return dom === '*' && dow === '*' ? { every: 'hour', minute } : undefined
  const h = num(hour, 0, 23)
  if (h === undefined) return undefined
  if (dom === '*' && dow === '*') return { every: 'day', hour: h, minute }
  if (dom === '*' && dow === '1-5') return { every: 'weekday', hour: h, minute }
  const day = num(dow, 0, 6)
  if (dom === '*' && day !== undefined) return { every: 'week', day, hour: h, minute }
  const date = num(dom, 1, 31)
  if (date !== undefined && dow === '*') return { every: 'month', date, hour: h, minute }
  return undefined
}
