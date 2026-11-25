// Which profile the window acts as: this Mac's choice, kept in the app's own
// folder. The profiles themselves are ollupi's users, with their names, in
// its store; the operator lists, makes and names them over the gateway.

import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FIRST_PROFILE } from '../shared/ipc'

/** A profile's id: it names folders under the home and is the segment a
 * connection's token carries, so it holds no separator. */
export const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/

const selectionFile = (): string => join(app.getPath('userData'), 'profile.json')

/** The profile the window acts as; the one a home starts with until the
 * person chooses another. */
export function activeProfile(): string {
  try {
    const saved = JSON.parse(readFileSync(selectionFile(), 'utf8')) as { id?: unknown }
    if (typeof saved.id === 'string' && PROFILE_ID.test(saved.id)) return saved.id
  } catch {
    // No choice kept yet, or one that cannot be read: the first profile.
  }
  return FIRST_PROFILE
}

/** Keeps a choice for the next start. */
export function rememberProfile(id: string): void {
  if (!PROFILE_ID.test(id)) throw new Error('not a profile id')
  write(selectionFile(), JSON.stringify({ id }))
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const candidate = `${path}.candidate`
  writeFileSync(candidate, text, { mode: 0o600 })
  renameSync(candidate, path)
}
