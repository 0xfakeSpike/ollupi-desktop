import { describe, expect, it } from 'vitest'
import { editConfigText } from './config'

// The shape of a real config.yaml: section comments above keys, commented-out
// entries inside sections, inline comments.
const file = `# Ollupi desktop backend.
name: ollupi

profiles:
  - id: default
    # Models, grouped by the API that serves them. The first is the default.
    models:
      - provider: deepseek
        base_url: https://api.deepseek.com
        api_key: sk-test
        names:
          - name: deepseek-flash
      # The local one.
      - provider: local
        base_url: http://127.0.0.1:11434/v1
        names:
          - name: qwen3:32b
      # - provider: openai
      #   base_url: https://api.openai.com/v1
    memory:
      model: all
`

describe('editConfigText', () => {
  it('changes only what was asked, keeping every comment where it was', () => {
    const edited = editConfigText(file, [
      { kind: 'set', path: ['profiles', 0, 'memory', 'model'], value: 'deepseek/deepseek-flash' },
    ])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).toBe(file.replace('      model: all\n', '      model: deepseek/deepseek-flash\n'))
  })

  it('leaves the file unchanged when nothing changes', () => {
    expect(editConfigText(file, [])).toEqual({ ok: true, text: file })
  })

  it('deletes keys', () => {
    const edited = editConfigText(file, [{ kind: 'delete', path: ['profiles', 0, 'memory'] }])
    expect(edited.ok && edited.text.includes('    memory:')).toBe(false)
  })

  it('moves a list item with its comment', () => {
    const edited = editConfigText(file, [{ kind: 'move', path: ['profiles', 0, 'models', 1], to: 0 }])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    const text = edited.text
    expect(text.indexOf('# The local one.')).toBeLessThan(text.indexOf('provider: local'))
    expect(text.indexOf('provider: local')).toBeLessThan(text.indexOf('provider: deepseek'))
    expect(text).toContain('      # - provider: openai\n')
  })

  it('appends a list item', () => {
    const edited = editConfigText(file, [{ kind: 'set', path: ['profiles', 0, 'models', 2], value: { provider: 'openai', names: [{ name: 'gpt-5.2' }] } }])
    expect(edited.ok && edited.text.includes('      - provider: openai\n        names:\n          - name: gpt-5.2\n')).toBe(true)
  })

  it('refuses a move outside the list', () => {
    expect(editConfigText(file, [{ kind: 'move', path: ['profiles', 0, 'models', 0], to: 2 }]).ok).toBe(false)
    expect(editConfigText(file, [{ kind: 'move', path: ['profiles', 0, 'memory'], to: 0 }]).ok).toBe(false)
  })

  it('refuses text that is not YAML', () => {
    expect(editConfigText('name: [unclosed', []).ok).toBe(false)
  })
})
