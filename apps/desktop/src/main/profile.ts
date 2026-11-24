// Which profile the window acts as. Profiles themselves live in config.yaml;
// this file keeps only the device's last choice, and brings in the names and
// colours 0.8.17-beta.3 kept beside it in profiles.json, once.

import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIRST_PROFILE, profileColorNames, type ConfigChange, type Profile, type ProfileColor, type ProfileSnapshot } from '../shared/ipc'

const ID = /^[A-Za-z0-9_-]{1,64}$/

const selectionFile = (): string => join(app.getPath('userData'), 'profile.json')
const legacyFile = (): string => join(app.getPath('userData'), 'profiles.json')

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

/** The profiles config declares, with the device's current choice. */
export function listProfiles(profiles: readonly { id: string; name?: string | null; color?: string | null }[]): ProfileSnapshot {
  const selected = activeProfile()
  const data: Profile[] = profiles.map((p) => ({
    id: p.id,
    name: p.name ?? '',
    color: validColor(p.color) ? p.color : profileColorNames[0],
  }))
  if (data.length === 0) data.push({ id: selected, name: '', color: profileColorNames[0] })
  const current = data.some((p) => p.id === selected) ? selected : data[0]!.id
  if (current !== selected) rememberProfile(current)
  return { data, current }
}

/** The config changes that give the profiles config declares the names and
 * colours profiles.json kept for them; none once the file is retired. */
export function legacyProfileChanges(profiles: readonly { id: string }[]): ConfigChange[] {
  let saved: { profiles?: unknown }
  try {
    saved = JSON.parse(readFileSync(legacyFile(), 'utf8')) as { profiles?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(saved.profiles)) return []
  const changes: ConfigChange[] = []
  for (const p of saved.profiles as { id?: unknown; name?: unknown; color?: unknown }[]) {
    const index = profiles.findIndex((c) => c.id === p?.id)
    if (index < 0) continue
    if (typeof p.name === 'string') changes.push({ kind: 'set', path: ['profiles', index, 'name'], value: p.name.trim() })
    if (typeof p.color === 'string' && validColor(p.color)) changes.push({ kind: 'set', path: ['profiles', index, 'color'], value: p.color })
  }
  return changes
}

/** Keeps profiles.json beside its replacement, read no more. */
export function retireLegacyProfiles(): void {
  try {
    renameSync(legacyFile(), `${legacyFile()}.imported`)
  } catch {
    // Nothing to retire.
  }
}

function validColor(color: string | null | undefined): color is ProfileColor {
  return typeof color === 'string' && (profileColorNames as readonly string[]).includes(color)
}

function write(path: string, text: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  const candidate = `${path}.candidate`
  writeFileSync(candidate, text, { mode: 0o600 })
  renameSync(candidate, path)
}
