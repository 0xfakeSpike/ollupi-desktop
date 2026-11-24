// The profiles this app serves, and which one the window acts as. The app is
// the identity provider of its local deployment: it keeps the list of
// profiles, with the name and colour each is shown by, in the backend's home
// (profiles.json, beside the data it scopes, so it travels with it), and
// makes the token a connection acts as one with. The backend makes the user
// of a profile when its token first reaches it. What a profile runs and owns
// (models, keys, settings, conversations) is its own, in the store, set
// through the gateway. Which profile the window acts as is this Mac's choice,
// kept in the app's own folder.

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FIRST_PROFILE, profileColorNames, type Profile, type ProfileColor, type ProfileSnapshot } from '../shared/ipc'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_NAME = 120

/** The sidecar's --import-config writes the same file, once, for the
 * profiles an older config.yaml declared. */
export const PROFILES_FILE = 'profiles.json'

const selectionFile = (): string => join(app.getPath('userData'), 'profile.json')

/** The profile the window acts as; the one a home starts with until the
 * person chooses another. */
export function activeProfile(): string {
  try {
    const saved = JSON.parse(readFileSync(selectionFile(), 'utf8')) as { id?: unknown }
    if (typeof saved.id === 'string' && ID.test(saved.id)) return saved.id
  } catch {
    // No choice kept yet, or one that cannot be read: the first profile.
  }
  return FIRST_PROFILE
}

/** Keeps a choice for the next start. */
export function rememberProfile(id: string): void {
  if (!ID.test(id)) throw new Error('not a profile id')
  write(selectionFile(), JSON.stringify({ id }))
}

/** The home's profiles, with this Mac's current choice, which falls back to
 * the first when the chosen one is gone. A home without a list serves the
 * profile it starts with. */
export function listProfiles(home: string): ProfileSnapshot {
  const data = readProfiles(home)
  if (data.length === 0) {
    data.push({ id: FIRST_PROFILE, name: '', color: profileColorNames[0] })
    writeProfiles(home, data)
  }
  const selected = activeProfile()
  const current = data.some((p) => p.id === selected) ? selected : data[0]!.id
  if (current !== selected) rememberProfile(current)
  return { data, current }
}

export function createProfile(home: string, name: string, color: ProfileColor): Profile {
  const profile = checked(randomUUID(), name, color)
  if (!profile.name) throw new Error('a new profile needs a name')
  writeProfiles(home, [...listProfiles(home).data, profile])
  return profile
}

export function updateProfile(home: string, id: string, name: string, color: ProfileColor): Profile {
  const data = listProfiles(home).data
  const i = data.findIndex((p) => p.id === id)
  if (i < 0) throw new Error('profile not found')
  data[i] = checked(id, name, color)
  writeProfiles(home, data)
  return data[i]!
}

/** Forgets a profile; its data goes first, through the backend. */
export function removeProfile(home: string, id: string): void {
  const data = listProfiles(home).data
  if (!data.some((p) => p.id === id)) throw new Error('profile not found')
  if (data.length === 1) throw new Error('the last profile cannot be deleted')
  writeProfiles(home, data.filter((p) => p.id !== id))
}

function checked(id: string, name: string, color: ProfileColor): Profile {
  if (!ID.test(id)) throw new Error('not a profile id')
  const trimmed = name.trim()
  if ([...trimmed].length > MAX_NAME) throw new Error(`a profile's name is at most ${MAX_NAME} characters`)
  if (!validColor(color)) throw new Error('not a profile colour')
  return { id, name: trimmed, color }
}

/** The list as the file has it, leaving out entries that cannot be one. */
function readProfiles(home: string): Profile[] {
  let saved: { profiles?: unknown }
  try {
    saved = JSON.parse(readFileSync(join(home, PROFILES_FILE), 'utf8')) as { profiles?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(saved.profiles)) return []
  const out: Profile[] = []
  for (const p of saved.profiles as { id?: unknown; name?: unknown; color?: unknown }[]) {
    if (typeof p?.id !== 'string' || !ID.test(p.id) || out.some((o) => o.id === p.id)) continue
    out.push({ id: p.id, name: typeof p.name === 'string' ? p.name.trim() : '', color: validColor(p.color) ? p.color : profileColorNames[0] })
  }
  return out
}

function writeProfiles(home: string, profiles: Profile[]): void {
  write(join(home, PROFILES_FILE), JSON.stringify({ profiles }, null, 2) + '\n')
}

function validColor(color: unknown): color is ProfileColor {
  return typeof color === 'string' && (profileColorNames as readonly string[]).includes(color)
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const candidate = `${path}.candidate`
  writeFileSync(candidate, text, { mode: 0o600 })
  renameSync(candidate, path)
}
