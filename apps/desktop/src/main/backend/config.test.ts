import { describe, expect, it } from 'vitest'
import { editConfigText } from './config'

// The shape of a real config.yaml: section comments above keys, commented-out
// entries inside sections, inline comments.
const file = `# Ollupi desktop backend.
name: ollupi

# OpenAI-compatible APIs.
endpoints:
  deepseek:
    base_url: https://api.deepseek.com
  # openai:
  #   base_url: https://api.openai.com/v1

# The first model is the default.
models:
  - id: deepseek-flash
    name: deepseek-flash
    endpoint: deepseek

settings:
  approvalPolicy: on-request # untrusted | on-request | never
  permissions: {}

memory:
  use: true
  generate: false
  # model: { id: memory, name: gpt-5.2, endpoint: openai }
`

describe('editConfigText', () => {
  it('changes only what was asked, keeping every comment where it was', () => {
    const edited = editConfigText(file, [
      { kind: 'set', path: ['memory', 'generate'], value: true },
      { kind: 'set', path: ['memory', 'model'], value: { id: 'deepseek-flash', name: 'deepseek-flash', endpoint: 'deepseek' } },
    ])
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.text).toBe(
      file.replace(
        '  generate: false\n',
        '  generate: true\n  model:\n    id: deepseek-flash\n    name: deepseek-flash\n    endpoint: deepseek\n',
      ),
    )
  })

  it('leaves the file unchanged when nothing changes', () => {
    expect(editConfigText(file, [])).toEqual({ ok: true, text: file })
  })

  it('deletes keys', () => {
    const edited = editConfigText(file, [{ kind: 'delete', path: ['memory', 'use'] }])
    expect(edited.ok && edited.text.includes('  use: true')).toBe(false)
  })

  it('refuses text that is not YAML', () => {
    expect(editConfigText('name: [unclosed', []).ok).toBe(false)
  })
})
