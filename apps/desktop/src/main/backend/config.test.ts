import { describe, expect, it } from 'vitest'
import { editConfigText, onlyProviders } from './config'

// The shape of the config.yaml the backend starts a home with: section
// comments above keys, inline comments, a commented-out section.
const file = `# Ollupi desktop backend.
name: ollupi

# The models this backend serves.
providers:
  - id: openai
    type: openai # openai | anthropic
    api_key: sk-a
    models:
      - name: a

# The system prompt.
prompt: hi

# How many threads may run at once (default 32).
# slots: 32
`

describe('editConfigText', () => {
  it('changes only what was asked, keeping every comment where it was', () => {
    const edited = editConfigText(file, [{ kind: 'set', path: ['providers', 0, 'api_key'], value: 'sk-b' }])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).toBe(file.replace('    api_key: sk-a\n', '    api_key: sk-b\n'))
  })

  it('leaves the file unchanged when nothing changes', () => {
    expect(editConfigText(file, [])).toEqual({ ok: true, text: file })
  })

  it('deletes keys, leaving the next section its comment', () => {
    const edited = editConfigText(file, [{ kind: 'delete', path: ['providers', 0, 'api_key'] }])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).not.toContain('api_key')
    expect(edited.text).toContain('\n# The system prompt.\nprompt: hi\n')
  })

  it('appends a list item', () => {
    const edited = editConfigText(file, [{ kind: 'set', path: ['providers', 0, 'models', 1], value: { name: 'b' } }])
    expect(edited.ok && edited.text.includes('    models:\n      - name: a\n      - name: b\n')).toBe(true)
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
