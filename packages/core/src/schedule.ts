// Schedules a person picks (every hour, day, weekday, week, month or year at
// a time) and the cron specs ollupi runs them by: five fields (minute hour
// day-of-month month day-of-week) or a descriptor, in the backend's local
// time (cron.New with time.Local), parsed by robfig/cron. A spec has no year:
// a task that runs once is a yearly one that ollupi ends after one run.

export type Schedule =
  | { every: 'hour'; minute: number }
  | { every: 'day'; hour: number; minute: number }
  | { every: 'weekday'; hour: number; minute: number }
  /** day: 0 is Sunday, as cron counts. */
  | { every: 'week'; day: number; hour: number; minute: number }
  /** A month without the date (the 31st in April) is skipped. */
  | { every: 'month'; date: number; hour: number; minute: number }
  /** month: 1 is January. */
  | { every: 'year'; month: number; date: number; hour: number; minute: number }

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
    case 'year':
      return `${s.minute} ${s.hour} ${s.date} ${s.month} *`
  }
}

const descriptors: Record<string, Schedule> = {
  '@hourly': { every: 'hour', minute: 0 },
  '@daily': { every: 'day', hour: 0, minute: 0 },
  '@midnight': { every: 'day', hour: 0, minute: 0 },
  '@weekly': { every: 'week', day: 0, hour: 0, minute: 0 },
  '@monthly': { every: 'month', date: 1, hour: 0, minute: 0 },
  '@yearly': { every: 'year', month: 1, date: 1, hour: 0, minute: 0 },
  '@annually': { every: 'year', month: 1, date: 1, hour: 0, minute: 0 },
}

/** The schedule a spec describes, when it is one of these shapes; other
 * specs (ranges, steps, several values) have none. */
export function scheduleOf(spec: string): Schedule | undefined {
  const d = descriptors[spec.trim()]
  if (d) return d
  const f = spec.trim().split(/\s+/)
  if (f.length !== 5) return undefined
  const [min, hour, dom, month, dow] = f as [string, string, string, string, string]
  const num = (v: string, lo: number, hi: number) => (/^\d{1,2}$/.test(v) && +v >= lo && +v <= hi ? +v : undefined)
  const minute = num(min, 0, 59)
  if (minute === undefined) return undefined
  if (month !== '*') {
    const [h, date, m] = [num(hour, 0, 23), num(dom, 1, 31), num(month, 1, 12)]
    return h !== undefined && date !== undefined && m !== undefined && dow === '*' ? { every: 'year', month: m, date, hour: h, minute } : undefined
  }
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

/** A task that runs once, at a local time: the yearly schedule of that
 * date, which ollupi ends after one run (times 1). */
export function onceAt(at: Date): Schedule {
  return { every: 'year', month: at.getMonth() + 1, date: at.getDate(), hour: at.getHours(), minute: at.getMinutes() }
}
