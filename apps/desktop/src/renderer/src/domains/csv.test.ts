import { describe, expect, it } from 'vitest'
import { parseTable, separatorOf } from './csv'

describe('separatorOf', () => {
  it('reads the separator from the extension', () => {
    expect(separatorOf('data/a.csv')).toBe(',')
    expect(separatorOf('A.CSV')).toBe(',')
    expect(separatorOf('b.tsv')).toBe('\t')
    expect(separatorOf('notes.md')).toBeUndefined()
    expect(separatorOf('csv')).toBeUndefined()
  })
})

describe('parseTable', () => {
  it('splits lines and fields', () => {
    expect(parseTable('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseTable('a,b\r\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps separators, line breaks and doubled quotes inside quotes', () => {
    expect(parseTable('name,note\n"Doe, J","said ""hi""\nthen left"\n', ',')).toEqual([
      ['name', 'note'],
      ['Doe, J', 'said "hi"\nthen left'],
    ])
  })

  it('keeps empty fields and pads short rows', () => {
    expect(parseTable('a,b,c\n1,,3\n4\n', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
      ['4', '', ''],
    ])
  })

  it('leaves out a byte-order mark', () => {
    expect(parseTable('﻿id,名称\n1,苹果', ',')).toEqual([
      ['id', '名称'],
      ['1', '苹果'],
    ])
  })

  it('reads tabs for a TSV', () => {
    expect(parseTable('a\tb,c\n1\t2', '\t')).toEqual([
      ['a', 'b,c'],
      ['1', '2'],
    ])
  })

  it('drops the row a cut may have split', () => {
    expect(parseTable('a,b\n1,2\n3,"unfin', ',', true)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads an empty file as no rows', () => {
    expect(parseTable('', ',')).toEqual([])
  })
})
