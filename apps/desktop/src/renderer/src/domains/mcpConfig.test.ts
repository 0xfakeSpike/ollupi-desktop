import { describe, expect, it } from 'vitest'
import type { BackendConfig } from '../../../shared/ipc'
import { editServer, KEPT, nameError, valuesOf } from './mcpConfig'

const config = {
  mcp: [{ name: 'gh', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer ${GITHUB_TOKEN}', 'X-Team': '' } }],
} as unknown as BackendConfig

describe('MCP server edits', () => {
  it("follows ollupi's naming rule", () => {
    expect(nameError('github', [])).toBeUndefined()
    expect(nameError('git__hub', [])).toBe('format')
    expect(nameError('-x', [])).toBe('format')
    expect(nameError('a'.repeat(33), [])).toBe('format')
    expect(nameError('gh', ['gh'])).toBe('taken')
  })

  it('keeps a value it was not given unless it is changed or removed', () => {
    const headers = valuesOf(config.mcp![0]!.headers)
    expect(headers).toEqual({ Authorization: 'Bearer ${GITHUB_TOKEN}', 'X-Team': KEPT })
    const changes = editServer(config, 0, { name: 'gh', transport: 'http', url: 'https://example.test/mcp', headers: { ...headers, Authorization: 'Bearer ${GH}' } })
    expect(changes).toContainEqual({ kind: 'set', path: ['mcp', 0, 'headers', 'Authorization'], value: 'Bearer ${GH}' })
    expect(changes.some((c) => c.path.join('.') === 'mcp.0.headers.X-Team')).toBe(false)
    const removed = editServer(config, 0, { name: 'gh', transport: 'http', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' } })
    expect(removed).toContainEqual({ kind: 'delete', path: ['mcp', 0, 'headers', 'X-Team'] })
  })

  it("drops the other transport's keys", () => {
    const changes = editServer(config, 0, { name: 'gh', transport: 'stdio', command: 'npx', args: ['server'], env: {} })
    expect(changes).toContainEqual({ kind: 'delete', path: ['mcp', 0, 'url'] })
    expect(changes).toContainEqual({ kind: 'delete', path: ['mcp', 0, 'headers'] })
    expect(changes).toContainEqual({ kind: 'set', path: ['mcp', 0, 'args'], value: ['server'] })
  })
})
