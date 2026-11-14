import { describe, expect, it } from 'vitest'
import { linkedPath, workspacePath } from './filePaths'

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

describe('linkedPath', () => {
  const folder = 'articles/zh/post'

  it('resolves against the file\'s folder', () => {
    expect(linkedPath('./fig-cost.svg', folder, root)).toBe('articles/zh/post/fig-cost.svg')
    expect(linkedPath('fig.svg', folder, root)).toBe('articles/zh/post/fig.svg')
    expect(linkedPath('../../en/post/index.md', folder, root)).toBe('articles/en/post/index.md')
    expect(linkedPath('img/a.png', '', root)).toBe('img/a.png')
  })

  it('decodes escapes and drops the query and fragment', () => {
    expect(linkedPath('./%E5%9B%BE%201.png', folder, root)).toBe('articles/zh/post/图 1.png')
    expect(linkedPath('other.md#setup', folder, root)).toBe('articles/zh/post/other.md')
    expect(linkedPath('a.svg?v=2', folder, root)).toBe('articles/zh/post/a.svg')
    expect(linkedPath('100%.md', folder, root)).toBe('articles/zh/post/100%.md')
  })

  it('takes an absolute path only under the root', () => {
    expect(linkedPath('/Users/me/project/assets/a.png', folder, root)).toBe('assets/a.png')
    expect(linkedPath('/Users/me/other/a.png', folder, root)).toBeUndefined()
  })

  it('leaves out URLs, fragments and paths out of the root', () => {
    expect(linkedPath('https://example.com/a.png', folder, root)).toBeUndefined()
    expect(linkedPath('//cdn.example.com/a.png', folder, root)).toBeUndefined()
    expect(linkedPath('data:image/png;base64,AAAA', folder, root)).toBeUndefined()
    expect(linkedPath('#setup', folder, root)).toBeUndefined()
    expect(linkedPath('../../../../a.png', folder, root)).toBeUndefined()
    expect(linkedPath('.', '', root)).toBeUndefined()
  })
})
