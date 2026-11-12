import { describe, expect, it } from 'vitest'
import { remarkCjkAutolink } from './cjkAutolink'

const link = (url: string, text = url) => ({ type: 'link', url, children: [{ type: 'text', value: text }] })
const para = (...children: object[]) => ({ type: 'root', children: [{ type: 'paragraph', children }] })
const run = (tree: ReturnType<typeof para>) => {
  remarkCjkAutolink()(tree as never)
  return tree.children[0]!.children
}

describe('remarkCjkAutolink', () => {
  it('ends a bare URL at the first Chinese character or full-width mark', () => {
    const out = run(para({ type: 'text', value: '见（' }, link('https://github.com/a/b/releases/tag/v0.7.26），和本地一致')))
    expect(out).toEqual([
      { type: 'text', value: '见（' },
      link('https://github.com/a/b/releases/tag/v0.7.26'),
      { type: 'text', value: '），和本地一致' },
    ])
  })

  it('keeps the http:// GFM puts before a www. literal', () => {
    const out = run(para(link('http://www.example.com/x。下一句', 'www.example.com/x。下一句')))
    expect(out[0]).toEqual(link('http://www.example.com/x', 'www.example.com/x'))
    expect(out[1]).toEqual({ type: 'text', value: '。下一句' })
  })

  it('leaves written links and plain URLs alone', () => {
    const named = { type: 'link', url: 'https://a.dev/文档', children: [{ type: 'text', value: '文档' }] }
    expect(run(para(named))).toEqual([named])
    expect(run(para(link('https://a.dev/x')))).toEqual([link('https://a.dev/x')])
  })
})
