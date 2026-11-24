import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? paths.userData : '') },
}))

import { activeProfile, legacyProfileChanges, listProfiles, rememberProfile, retireLegacyProfiles } from './profile'

describe('profile selection', () => {
  beforeEach(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'ollupi-profiles-'))
  })

  afterEach(() => rmSync(paths.userData, { recursive: true, force: true }))

  it('lists the display metadata config declares', () => {
    expect(listProfiles([
      { id: 'default', name: 'Me', color: 'stone' },
      { id: 'work', name: 'Work', color: 'teal' },
    ])).toEqual({
      current: 'default',
      data: [
        { id: 'default', name: 'Me', color: 'stone' },
        { id: 'work', name: 'Work', color: 'teal' },
      ],
    })
  })

  it('keeps only the device choice locally and falls back when it disappears', () => {
    rememberProfile('work')
    expect(activeProfile()).toBe('work')
    expect(listProfiles([{ id: 'default', name: '', color: 'stone' }]).current).toBe('default')
    expect(activeProfile()).toBe('default')
  })

  it('brings in the names and colours profiles.json kept, once', () => {
    const file = join(paths.userData, 'profiles.json')
    writeFileSync(file, JSON.stringify({ profiles: [{ id: 'default', name: ' Me ', color: 'sky' }, { id: 'gone', name: 'Gone', color: 'rose' }, { id: 'work', name: 'Work', color: 'red' }] }))
    expect(legacyProfileChanges([{ id: 'default' }, { id: 'work' }])).toEqual([
      { kind: 'set', path: ['profiles', 0, 'name'], value: 'Me' },
      { kind: 'set', path: ['profiles', 0, 'color'], value: 'sky' },
      { kind: 'set', path: ['profiles', 1, 'name'], value: 'Work' },
    ])
    retireLegacyProfiles()
    expect(existsSync(file)).toBe(false)
    expect(legacyProfileChanges([{ id: 'default' }])).toEqual([])
  })
})
