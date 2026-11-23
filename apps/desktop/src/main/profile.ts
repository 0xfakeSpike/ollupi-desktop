// The profiles this app presents, and which one the window acts as. Ollupi
// owns the id and its data; the display name and colour are the app's own,
// so they stay here rather than entering the gateway protocol.

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIRST_PROFILE, profileColorNames, type Profile, type ProfileColor, type ProfileSnapshot } from '../shared/ipc'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_NAME = 120

const selectionFile = (): string => join(app.getPath('userData'), 'profile.json')
const profilesFile = (): string => join(app.getPath('userData'), 'profiles.json')
const pendingFile = (): string => join(app.getPath('userData'), 'profile-pending.json')

/** The profile the window acts as; the one the home was made with until the
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

interface ProfileFile {
  profiles: Profile[]
}

/** The app's profiles, with every id the backend config declares. Missing
 * display metadata starts blank, as the first profile did before profiles
 * had names. */
export function listProfiles(ids: string[]): ProfileSnapshot {
  const selected = activeProfile()
  const wanted = [...new Set(ids)]
  const known = readProfiles()
  const byID = new Map(known.map((p) => [p.id, p]))
  const data = wanted.map((id) => byID.get(id) ?? { id, name: '', color: profileColorNames[0] })
  const changed = data.length !== known.length || data.some((p) => byID.get(p.id)?.name !== p.name || byID.get(p.id)?.color !== p.color)
  if (changed) writeProfiles(data)
  if (data.length === 0) throw new Error('the config has no profiles')
  const current = data.some((p) => p.id === selected) ? selected : data[0]!.id
  if (current !== selected) rememberProfile(current)
  return { data, current }
}

/** The profiles already kept by the app, for a config that cannot currently
 * be read. This never removes metadata. */
export function storedProfiles(): ProfileSnapshot {
  const selected = activeProfile()
  const data = readProfiles()
  if (data.length === 0) data.push({ id: selected, name: '', color: profileColorNames[0] })
  return { data, current: data.some((p) => p.id === selected) ? selected : data[0]!.id }
}

export function createProfile(name: string, color: ProfileColor): Profile {
  const p = profileDraft(name, color)
  putProfile(p)
  return p
}

/** A validated profile whose metadata has not been written yet. */
export function profileDraft(name: string, color: ProfileColor): Profile {
  const p = checked(randomUUID(), name, color)
  if (!p.name) throw new Error('a new profile needs a name')
  return p
}

export function putProfile(p: Profile): void {
  const data = [...readProfiles().filter((x) => x.id !== p.id), p]
  writeProfiles(data)
}

export function updateProfile(id: string, name: string, color: ProfileColor): Profile {
  if (!ID.test(id)) throw new Error('not a profile id')
  const p = checked(id, name, color)
  const data = readProfiles()
  const i = data.findIndex((x) => x.id === id)
  if (i < 0) throw new Error('profile not found')
  data[i] = p
  writeProfiles(data)
  return p
}

export function removeProfile(id: string): void {
  writeProfiles(readProfiles().filter((p) => p.id !== id))
}

/** A creation that has not yet been confirmed by config.yaml. */
export function beginProfileCreate(profile: Profile): void {
  write(pendingFile(), JSON.stringify({ profile }))
}

export function pendingProfile(): Profile | undefined {
  try {
    const saved = JSON.parse(readFileSync(pendingFile(), 'utf8')) as { profile?: Profile }
    const p = saved.profile
    if (!p || typeof p.name !== 'string' || typeof p.color !== 'string') return undefined
    return checked(p.id, p.name, p.color as ProfileColor)
  } catch {
    return undefined
  }
}

export function finishProfileCreate(): void {
  rmSync(pendingFile(), { force: true })
}

export function rollbackProfileCreate(id: string): void {
  removeProfile(id)
  finishProfileCreate()
}

function checked(id: string, name: string, color: ProfileColor): Profile {
  if (!ID.test(id)) throw new Error('not a profile id')
  name = name.trim()
  if ([...name].length > MAX_NAME) throw new Error(`a profile name must be at most ${MAX_NAME} characters`)
  if (!profileColorNames.includes(color)) throw new Error('not a profile colour')
  return { id, name, color }
}

function readProfiles(): Profile[] {
  try {
    const saved = JSON.parse(readFileSync(profilesFile(), 'utf8')) as Partial<ProfileFile>
    if (!Array.isArray(saved.profiles)) return []
    return saved.profiles.flatMap((p) => {
      if (!p || typeof p.id !== 'string' || !ID.test(p.id) || typeof p.name !== 'string' || typeof p.color !== 'string') return []
      if (!profileColorNames.includes(p.color as ProfileColor)) return []
      return [{ id: p.id, name: p.name, color: p.color }]
    })
  } catch {
    return []
  }
}

function writeProfiles(profiles: Profile[]): void {
  write(profilesFile(), JSON.stringify({ profiles } satisfies ProfileFile))
}

/** Keeps both files private and replaces them atomically. */
function write(path: string, text: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  const candidate = `${path}.candidate`
  writeFileSync(candidate, text, { mode: 0o600 })
  renameSync(candidate, path)
}
