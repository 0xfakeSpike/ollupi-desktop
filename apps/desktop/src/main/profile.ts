// Which profile the window acts as. The backend names every connection by a
// profile it holds, and the app remembers the last one chosen here, so a
// restart opens as it.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIRST_PROFILE } from '../shared/ipc'

const ID = /^[A-Za-z0-9_-]{1,64}$/

const file = (): string => join(app.getPath('userData'), 'profile.json')

/** The profile the window acts as; the one the home was made with until the
 * person chooses another. */
export function activeProfile(): string {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as { id?: unknown }
    if (typeof saved.id === 'string' && ID.test(saved.id)) return saved.id
  } catch {
    // No choice kept yet, or one that cannot be read: the first profile.
  }
  return FIRST_PROFILE
}

/** Keeps a choice for the next start. */
export function rememberProfile(id: string): void {
  if (!ID.test(id)) throw new Error('not a profile id')
  writeFileSync(file(), JSON.stringify({ id }), { mode: 0o600 })
}
