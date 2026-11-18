import { describe, expect, it } from 'vitest'
import { nameError, serverOf } from './mcp'

describe('MCP servers', () => {
  it("follows ollupi's naming rule", () => {
    expect(nameError('github', [])).toBeUndefined()
    expect(nameError('git__hub', [])).toBe('format')
    expect(nameError('-x', [])).toBe('format')
    expect(nameError('a'.repeat(33), [])).toBe('format')
    expect(nameError('gh', ['gh'])).toBe('taken')
    expect(nameError('browser', [])).toBe('builtin')
  })

  it('keeps one transport and only what is set', () => {
    expect(serverOf({ name: 'fs', transport: 'stdio', command: 'npx', args: [], env: {} })).toEqual({ name: 'fs', command: 'npx' })
    expect(serverOf({ name: 'gh', transport: 'http', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer x' } })).toEqual({
      name: 'gh',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer x' },
    })
  })
})
