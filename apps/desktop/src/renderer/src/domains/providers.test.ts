import { describe, expect, it } from 'vitest'
import type { BackendConfig } from '../../../shared/ipc'
import { addModels, addProvider, cannotRemove, cannotRemoveProvider, editModel, editProvider, limitsOf, removeModel, removeProvider, type ModelFields } from './providers'

const limits = { context: 128_000, output: 16_384 }
const listed = (name: string): ModelFields => ({ name, calls: undefined, thinking: undefined, images: false, limits })

const config = {
  name: 'ollupi',
  providers: [
    { id: 'deepseek', type: 'openai', api_key: 'sk-test', models: [{ name: 'deepseek-flash', limits }, { name: 'deepseek-pro', limits }] },
    { id: 'local', type: 'openai', models: [{ name: 'qwen3:32b', limits }] },
  ],
} as BackendConfig

describe('provider edits', () => {
  it('adds a provider with the models chosen from its list', () => {
    expect(addProvider(config, { provider: 'openai', type: 'openai', baseUrl: '', apiKey: 'sk-o' }, [listed('gpt-5.2')])).toEqual([
      { kind: 'set', path: ['providers', 2], value: { id: 'openai', type: 'openai', api_key: 'sk-o', models: [{ name: 'gpt-5.2', limits }] } },
    ])
  })

  it('appends models after the ones a provider serves', () => {
    expect(addModels(config, 0, [listed('deepseek-chat')])).toEqual([{ kind: 'set', path: ['providers', 0, 'models', 2], value: { name: 'deepseek-chat', limits } }])
  })

  it('edits the model at its place in the provider', () => {
    const changes = editModel(config, 0, 1, { ...listed('deepseek-pro'), images: true })
    expect(changes).toContainEqual({ kind: 'set', path: ['providers', 0, 'models', 1, 'images'], value: true })
    expect(changes.every((c) => c.path.slice(0, 4).join('/') === 'providers/0/models/1')).toBe(true)
  })

  it('writes the key in the file, and removes it when emptied', () => {
    expect(editProvider(config, 1, { provider: 'local', type: 'openai', baseUrl: '', apiKey: 'sk-local' })).toContainEqual({ kind: 'set', path: ['providers', 1, 'api_key'], value: 'sk-local' })
    expect(editProvider(config, 0, { provider: 'deepseek', type: 'openai', baseUrl: '', apiKey: '' })).toContainEqual({ kind: 'delete', path: ['providers', 0, 'api_key'] })
  })

  it('removes a provider with its last model', () => {
    expect(removeModel(config, 1, 0)).toEqual([{ kind: 'delete', path: ['providers', 1] }])
    expect(removeModel(config, 0, 1)).toEqual([{ kind: 'delete', path: ['providers', 0, 'models', 1] }])
    expect(removeProvider(config, 0)).toEqual([{ kind: 'delete', path: ['providers', 0] }])
  })

  it('keeps the backend serving at least one model', () => {
    expect(cannotRemove(config)).toBeUndefined()
    expect(cannotRemoveProvider(config, 0)).toBeUndefined()
    const one = { ...config, providers: [config.providers![1]!] } as BackendConfig
    expect(cannotRemove(one)).toBe('lastModel')
    expect(cannotRemoveProvider(one, 0)).toBe('lastModel')
  })

  it('takes typed limits only when ollupi would', () => {
    expect(limitsOf({ context: '', input: '', output: '' })).toEqual({ context: 128_000, output: 8_192 })
    expect(limitsOf({ context: '1000', input: 'x', output: '' })).toBeUndefined()
  })
})
