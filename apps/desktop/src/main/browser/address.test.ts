import { describe, expect, it } from 'vitest'
import { typedPage } from './address'

const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`

describe('typedPage', () => {
  it('opens what names a page', () => {
    expect(typedPage('github.com')).toBe('https://github.com/')
    expect(typedPage(' example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
    expect(typedPage('http://example.com')).toBe('http://example.com/')
    expect(typedPage('localhost:5173/x')).toBe('http://localhost:5173/x')
    expect(typedPage('localhost')).toBe('http://localhost/')
    expect(typedPage('192.168.1.1')).toBe('https://192.168.1.1/')
    expect(typedPage('intranet:8080')).toBe('https://intranet:8080/')
    expect(typedPage('例子.中国')).toBe(new URL('https://例子.中国').toString())
  })

  it('searches Google for anything else', () => {
    expect(typedPage('github')).toBe(search('github'))
    expect(typedPage('how to cook rice')).toBe(search('how to cook rice'))
    expect(typedPage('天气 北京')).toBe(search('天气 北京'))
    expect(typedPage('v1.2')).toBe(search('v1.2'))
    expect(typedPage('a@b.com')).toBe(search('a@b.com'))
    expect(typedPage('c++ & go?')).toBe(search('c++ & go?'))
  })

  it('opens only web pages', () => {
    expect(() => typedPage('file:///etc/passwd')).toThrow()
  })
})
