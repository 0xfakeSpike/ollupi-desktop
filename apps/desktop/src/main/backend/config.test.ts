import { describe, expect, it } from 'vitest'
import { editConfigText, onlyProviders } from './config'

// The shape of the config.yaml the backend starts a home with: section
// comments above keys, inline comments, a commented-out section.
const file = `# Ollupi desktop backend.
name: ollupi

# Commands and file edits, in the sandbox.
workspace:
  enabled: true
  sandbox_mode: workspace-write # read-only | workspace-write | full-access
  command_timeout_sec: 60
  workspace_dirs:
    - ~/a

# Agent Skills.
skills_dir: skills

# How many threads may run at once (default 32).
# slots: 32
`

describe('editConfigText', () => {
  it('changes only what was asked, keeping every comment where it was', () => {
    const edited = editConfigText(file, [{ kind: 'set', path: ['workspace', 'command_timeout_sec'], value: 120 }])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).toBe(file.replace('  command_timeout_sec: 60\n', '  command_timeout_sec: 120\n'))
  })

  it('leaves the file unchanged when nothing changes', () => {
    expect(editConfigText(file, [])).toEqual({ ok: true, text: file })
  })

  it('deletes keys, leaving the next section its comment', () => {
    const edited = editConfigText(file, [{ kind: 'delete', path: ['workspace', 'command_timeout_sec'] }])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).not.toContain('command_timeout_sec')
    expect(edited.text).toContain('\n# Agent Skills.\nskills_dir: skills\n')
  })

  it('appends a list item', () => {
    const edited = editConfigText(file, [{ kind: 'set', path: ['workspace', 'workspace_dirs', 1], value: '~/b' }])
    expect(edited.ok && edited.text.includes('  workspace_dirs:\n    - ~/a\n    - ~/b\n')).toBe(true)
  })

  it('refuses text that is not YAML', () => {
    expect(editConfigText('name: [unclosed', []).ok).toBe(false)
  })
})

describe('onlyProviders', () => {
  it('reloads a change to the providers alone, and restarts for any other', () => {
    expect(onlyProviders([{ kind: 'set', path: ['providers', 0, 'api_key'], value: 'k' }, { kind: 'delete', path: ['providers', 1] }])).toBe(true)
    expect(onlyProviders([{ kind: 'set', path: ['providers', 0, 'api_key'], value: 'k' }, { kind: 'set', path: ['slots'], value: 8 }])).toBe(false)
    expect(onlyProviders([])).toBe(false)
  })
})
