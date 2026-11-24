import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? paths.userData : '') },
}))

import { activeProfile, createProfile, listProfiles, PROFILES_FILE, rememberProfile, removeProfile, updateProfile } from './profile'

describe('profiles', () => {
  let home: string

  beforeEach(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'ollupi-app-'))
    home = mkdtempSync(join(tmpdir(), 'ollupi-home-'))
  })

  afterEach(() => {
    rmSync(paths.userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  })

  it('serves the profile a fresh home starts with, and keeps it in the home', () => {
    expect(listProfiles(home)).toEqual({ current: 'default', data: [{ id: 'default', name: '', color: 'stone' }] })
    expect(JSON.parse(readFileSync(join(home, PROFILES_FILE), 'utf8'))).toEqual({ profiles: [{ id: 'default', name: '', color: 'stone' }] })
  })

  it('reads the list the import wrote, leaving out what cannot be a profile', () => {
    writeFileSync(join(home, PROFILES_FILE), JSON.stringify({ profiles: [
      { id: 'default', name: ' Me ', color: 'teal' },
      { id: 'a/b', name: 'Bad' },
      { id: 'default', name: 'Twice' },
      { id: 'work', name: 'Work', color: 'red' },
    ] }))
    expect(listProfiles(home).data).toEqual([
      { id: 'default', name: 'Me', color: 'teal' },
      { id: 'work', name: 'Work', color: 'stone' },
    ])
  })

  it('keeps this Mac\'s choice apart, and falls back when it is gone', () => {
    const work = createProfile(home, 'Work', 'sky')
    rememberProfile(work.id)
    expect(listProfiles(home).current).toBe(work.id)
    removeProfile(home, work.id)
    expect(listProfiles(home).current).toBe('default')
    expect(activeProfile()).toBe('default')
  })

  it('names, renames and removes profiles, but never the last', () => {
    expect(() => createProfile(home, '  ', 'stone')).toThrow()
    const work = createProfile(home, ' Work ', 'teal')
    expect(work.name).toBe('Work')
    expect(updateProfile(home, work.id, 'Job', 'rose')).toEqual({ id: work.id, name: 'Job', color: 'rose' })
    expect(listProfiles(home).data.map((p) => p.name)).toEqual(['', 'Job'])
    removeProfile(home, work.id)
    expect(() => removeProfile(home, 'default')).toThrow('last profile')
  })
})
