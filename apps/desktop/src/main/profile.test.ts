import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? paths.userData : '') },
}))

import { activeProfile, rememberProfile } from './profile'

describe('the profile the window acts as', () => {
  beforeEach(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'ollupi-app-'))
  })

  afterEach(() => {
    rmSync(paths.userData, { recursive: true, force: true })
  })

  it('is the one a home starts with until one is chosen', () => {
    expect(activeProfile()).toBe('default')
  })

  it('keeps a choice for the next start', () => {
    rememberProfile('work')
    expect(activeProfile()).toBe('work')
    expect(() => rememberProfile('a/b')).toThrow()
  })

  it('takes a saved choice that cannot be a profile as no choice', () => {
    writeFileSync(join(paths.userData, 'profile.json'), JSON.stringify({ id: '../x' }))
    expect(activeProfile()).toBe('default')
  })
})
