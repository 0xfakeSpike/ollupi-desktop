import { describe, expect, it } from 'vitest'
import { workspacePath } from './filePaths'

const root = '/Users/me/project'

describe('workspacePath', () => {
  it('takes a relative path as it is, without ./ or a line', () => {
    expect(workspacePath('export/张一铭-DevRel-中文.pdf', root)).toBe('export/张一铭-DevRel-中文.pdf')
    expect(workspacePath('./src/main.ts:42', root)).toBe('src/main.ts')
    expect(workspacePath('src/main.ts:42:7', root)).toBe('src/main.ts')
    expect(workspacePath('tasks.md', root)).toBe('tasks.md')
    expect(workspacePath('notes/My File.md', root)).toBe('notes/My File.md')
  })

  it('makes an absolute path under the root relative', () => {
    expect(workspacePath('/Users/me/project/docs/a.md', root)).toBe('docs/a.md')
    expect(workspacePath('/Users/me/project/docs/guide/', `${root}/`)).toBe('docs/guide')
  })

  it('leaves out what is not a path into the workspace', () => {
    expect(workspacePath('/Users/me/other/a.md', root)).toBeUndefined()
    expect(workspacePath('/Users/me/project-two/a.md', root)).toBeUndefined()
    expect(workspacePath('~/notes.md', root)).toBeUndefined()
    expect(workspacePath('https://example.com/a.md', root)).toBeUndefined()
    expect(workspacePath('mailto:a@b.c', root)).toBeUndefined()
    expect(workspacePath('true', root)).toBeUndefined()
    expect(workspacePath('npm run build', root)).toBeUndefined()
    expect(workspacePath('a\nb.md', root)).toBeUndefined()
    expect(workspacePath('src/*.ts', root)).toBeUndefined()
    expect(workspacePath('', root)).toBeUndefined()
  })
})
