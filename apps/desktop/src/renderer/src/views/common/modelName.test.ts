import { describe, expect, it } from 'vitest'
import { modelName, providerOf } from './modelName'

describe('modelName', () => {
  it('leaves the API in front out, keeping the slashes inside a model name', () => {
    expect(modelName('deepseek/deepseek-flash')).toBe('deepseek-flash')
    expect(modelName('qwen/kimi/kimi-k2.6')).toBe('kimi/kimi-k2.6')
    expect(modelName('gpt-5.6-sol')).toBe('gpt-5.6-sol')
  })
})

describe('providerOf', () => {
  it('is the API in front of a connection', () => {
    expect(providerOf('deepseek/deepseek-flash')).toBe('deepseek')
    expect(providerOf('qwen/kimi/kimi-k2.6')).toBe('qwen')
  })

  it('is empty for a name without an API in front', () => {
    expect(providerOf('deepseek-flash')).toBe('')
  })
})
