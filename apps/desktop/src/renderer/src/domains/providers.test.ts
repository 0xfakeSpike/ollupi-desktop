import { describe, expect, it } from 'vitest'
import { addModels, addProvider, cannotRemove, cannotRemoveProvider, editModel, editProvider, limitsOf, removeModel, removeProvider, type ModelFields, type Provider } from './providers'

const limits = { context: 128_000, output: 16_384 }
const listed = (name: string): ModelFields => ({ name, calls: undefined, thinking: undefined, images: false, limits })

const catalog: Provider[] = [
  { id: 'deepseek', api: 'openai', apiKey: 'sk-test', models: [{ name: 'deepseek-flash', limits }, { name: 'deepseek-pro', limits }] },
  { id: 'local', api: 'openai', models: [{ name: 'qwen3:32b', limits }] },
]

describe('catalog edits', () => {
  it('adds a provider with the models chosen from its list, after the others', () => {
    expect(addProvider(catalog, { provider: 'openai', type: 'openai', baseUrl: '', apiKey: 'sk-o' }, [listed('gpt-5.2')])).toEqual([
      ...catalog,
      { id: 'openai', api: 'openai', apiKey: 'sk-o', models: [{ name: 'gpt-5.2', limits }] },
    ])
  })

  it('appends models after the ones a provider serves', () => {
    expect(addModels(catalog, 0, [listed('deepseek-chat')])[0]!.models!.map((m) => m.name)).toEqual(['deepseek-flash', 'deepseek-pro', 'deepseek-chat'])
  })

  it('edits the model at its place in the provider, and nothing else', () => {
    const next = editModel(catalog, 0, 1, { ...listed('deepseek-pro'), images: true })
    expect(next[0]!.models).toEqual([{ name: 'deepseek-flash', limits }, { name: 'deepseek-pro', images: true, limits }])
    expect(next[1]).toBe(catalog[1])
  })

  it('keeps a provider’s models when its account changes, and drops an emptied key', () => {
    const keyed = editProvider(catalog, 1, { provider: 'local', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'sk-local' })[1]!
    expect(keyed).toEqual({ id: 'local', api: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'sk-local', models: catalog[1]!.models })
    expect(editProvider(catalog, 0, { provider: 'deepseek', type: 'openai', baseUrl: '', apiKey: '' })[0]).not.toHaveProperty('apiKey')
  })

  it('removes a provider with its last model', () => {
    expect(removeModel(catalog, 1, 0)).toEqual([catalog[0]])
    expect(removeModel(catalog, 0, 1)[0]!.models).toEqual([{ name: 'deepseek-flash', limits }])
    expect(removeProvider(catalog, 0)).toEqual([catalog[1]])
  })

  it('keeps the deployment serving at least one model', () => {
    expect(cannotRemove(catalog)).toBeUndefined()
    expect(cannotRemoveProvider(catalog, 0)).toBeUndefined()
    const one = [catalog[1]!]
    expect(cannotRemove(one)).toBe('lastModel')
    expect(cannotRemoveProvider(one, 0)).toBe('lastModel')
  })

  it('takes typed limits only when ollupi would', () => {
    expect(limitsOf({ context: '', input: '', output: '' })).toEqual({ context: 128_000, output: 8_192 })
    expect(limitsOf({ context: '1000', input: 'x', output: '' })).toBeUndefined()
  })
})
