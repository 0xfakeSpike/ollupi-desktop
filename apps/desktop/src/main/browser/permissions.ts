// Which site may use which permission of the Mac, once the person says so: a
// page asks, the panel shows the request, and the answer is kept for that site
// alone. The ones that reach the Mac itself — the camera, the microphone, the
// screen, the ports — are asked every time and never kept, as a browser asks
// them.

import { readKept, writeKept } from './file'

/** How a page may come to use a permission: the person's answer once for the
 * site, an answer every time, or not at all. */
export type Asking = 'once' | 'each' | 'never'

/** Asked once per site, and the answer kept; the ones a page needs to work as
 * a person expects, without reaching anything of the Mac. */
const keepable: ReadonlySet<string> = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'notifications',
  'fullscreen',
  'pointerLock',
  'mediaKeySystem',
])

/** Asked every time, never kept: these reach the Mac's own devices, or where
 * the person is. */
const device: ReadonlySet<string> = new Set([
  'geolocation',
  'media',
  'display-capture',
  'midi',
  'midiSysex',
  'hid',
  'serial',
  'usb',
  'idle-detection',
  'openExternal',
  'speaker-selection',
])

/** What a page must have before it may use a permission; one named nowhere
 * here is refused without asking, as no page of ours needs it. */
export function asking(permission: string): Asking {
  if (keepable.has(permission)) return 'once'
  if (device.has(permission)) return 'each'
  return 'never'
}

/** The person's answers, by site: { 'example.com': { notifications: true } }. */
type Answers = Record<string, Record<string, boolean>>

export class Permissions {
  private answers: Answers | undefined
  /** Answers in the order they were given, each written on the last's file. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  /** The person's answer for a site and a permission, if they gave one. */
  async answered(host: string, permission: string): Promise<boolean | undefined> {
    const answer = (await this.all())[host]?.[permission]
    return typeof answer === 'boolean' ? answer : undefined
  }

  /** Keeps the person's answer for the site, to answer for it next time. */
  answer(host: string, permission: string, allow: boolean): Promise<void> {
    const next = this.queue.then(async () => {
      const all = await this.all()
      const kept: Answers = { ...all, [host]: { ...(all[host] ?? {}), [permission]: allow } }
      await writeKept(this.file, JSON.stringify(kept, null, 2))
      this.answers = kept
    })
    this.queue = next.catch(() => {})
    return next
  }

  private async all(): Promise<Answers> {
    if (this.answers) return this.answers
    this.answers = answersFrom(await readKept(this.file))
    return this.answers
  }
}

/** What a saved file holds, as answers: anything else in it is left out. */
function answersFrom(saved: unknown): Answers {
  const answers: Answers = {}
  if (!saved || typeof saved !== 'object') return answers
  for (const [host, permissions] of Object.entries(saved)) {
    if (!permissions || typeof permissions !== 'object') continue
    const kept: Record<string, boolean> = {}
    for (const [permission, allow] of Object.entries(permissions)) {
      if (typeof allow === 'boolean') kept[permission] = allow
    }
    answers[host] = kept
  }
  return answers
}
