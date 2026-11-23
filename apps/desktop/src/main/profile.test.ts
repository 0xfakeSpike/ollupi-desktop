import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? paths.userData : '') },
}))

import { activeProfile, beginProfileCreate, createProfile, finishProfileCreate, listProfiles, pendingProfile, profileDraft, rememberProfile, rollbackProfileCreate, updateProfile } from './profile'

describe('profiles shown by the app', () => {
  beforeEach(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'ollupi-profiles-'))
  })

  afterEach(() => rmSync(paths.userData, { recursive: true, force: true }))

  it('fills the display metadata config needs without putting it in Ollupi', () => {
    expect(listProfiles(['default', 'work'])).toEqual({
      current: 'default',
      data: [
        { id: 'default', name: '', color: 'stone' },
        { id: 'work', name: '', color: 'stone' },
      ],
    })
  })

  it('creates, renames and recolours only the app-owned metadata', () => {
    const made = createProfile('Work', 'teal')
    expect(made.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(updateProfile(made.id, 'Studio', 'rose')).toEqual({ id: made.id, name: 'Studio', color: 'rose' })

    rememberProfile(made.id)
    expect(activeProfile()).toBe(made.id)
    expect(listProfiles(['default', 'work', made.id]).current).toBe(made.id)
    expect(JSON.parse(readFileSync(join(paths.userData, 'profiles.json'), 'utf8'))).toEqual({
      profiles: [
        { id: 'default', name: '', color: 'stone' },
        { id: 'work', name: '', color: 'stone' },
        { id: made.id, name: 'Studio', color: 'rose' },
      ],
    })
  })

  it('can finish or roll back a profile creation interrupted across files', () => {
    const pending = profileDraft('Side project', 'amber')
    beginProfileCreate(pending)
    expect(pendingProfile()).toEqual(pending)
    rollbackProfileCreate(pending.id)
    expect(pendingProfile()).toBeUndefined()

    const kept = profileDraft('Studio', 'violet')
    beginProfileCreate(kept)
    finishProfileCreate()
    expect(pendingProfile()).toBeUndefined()
  })
})
