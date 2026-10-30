import { describe, expect, it } from 'vitest'
import type { BackendConfig } from '../../../shared/ipc'
import {
  addModels,
  addProvider,
  cannotRemove,
  cannotRemoveProvider,
  editModel,
  editProvider,
  makeDefault,
  removeModel,
  removeProvider,
  type ModelFields,
} from './modelConfig'

const limits = { context: 128_000, output: 16_384 }
const listed = (name: string): ModelFields => ({ name, calls: undefined, thinking: undefined, images: false, limits })

const config = (memory: BackendConfig['memory']): BackendConfig =>
  ({
    name: 'ollupi',
    models: [
      { provider: 'deepseek', type: 'openai', api_key: 'sk-test', names: [{ name: 'deepseek-flash', limits }, { name: 'deepseek-pro', limits }] },
      { provider: 'local', type: 'openai', names: [{ name: 'qwen3:32b', limits }] },
    ],
    permissions: {},
    workspace: { enabled: true, workspace_dirs: null, command_timeout_sec: 60, command_blacklist: null },
    memory,
  }) as BackendConfig

const learning = config({ use: true, generate: true, model: 'deepseek/deepseek-flash' })
const notLearning = config({ use: true, generate: false, model: 'deepseek/deepseek-flash' })

describe('model edits', () => {
  it('adds a provider with the models chosen from its list', () => {
    expect(addProvider(learning, { provider: 'openai', type: 'openai', baseUrl: '', apiKey: 'sk-test' }, [listed('gpt-5.2'), listed('gpt-5.2-mini')])).toEqual([
      { kind: 'set', path: ['models', 2], value: { provider: 'openai', type: 'openai', api_key: 'sk-test', names: [{ name: 'gpt-5.2', limits }, { name: 'gpt-5.2-mini', limits }] } },
    ])
  })

  it('appends models after the ones a provider serves', () => {
    expect(addModels(learning, 0, [listed('deepseek-chat'), listed('deepseek-reasoner')])).toEqual([
      { kind: 'set', path: ['models', 0, 'names', 2], value: { name: 'deepseek-chat', limits } },
      { kind: 'set', path: ['models', 0, 'names', 3], value: { name: 'deepseek-reasoner', limits } },
    ])
  })

  it('moves memory.model along when its provider is renamed', () => {
    expect(editProvider(learning, 0, { provider: 'ds', type: 'openai', baseUrl: '', apiKey: 'sk-test' })).toContainEqual({
      kind: 'set',
      path: ['memory', 'model'],
      value: 'ds/deepseek-flash',
    })
    expect(editProvider(learning, 1, { provider: 'ollama', type: 'openai', baseUrl: '', apiKey: '' }).some((c) => c.path[0] === 'memory')).toBe(false)
  })

  it('moves memory.model along when its model is renamed', () => {
    const fields = { name: 'deepseek-v4-flash', calls: undefined, thinking: undefined, images: false, limits }
    expect(editModel(learning, 0, 0, fields)).toContainEqual({ kind: 'set', path: ['memory', 'model'], value: 'deepseek/deepseek-v4-flash' })
    expect(editModel(learning, 0, 1, { ...fields, name: 'x' }).some((c) => c.path[0] === 'memory')).toBe(false)
  })

  it('writes the API type, and whether a model takes images only when it does', () => {
    expect(editProvider(learning, 1, { provider: 'local', type: 'anthropic', baseUrl: '', apiKey: '' })).toContainEqual({ kind: 'set', path: ['models', 1, 'type'], value: 'anthropic' })
    expect(editModel(learning, 1, 0, { ...listed('qwen3:32b'), images: true })).toContainEqual({ kind: 'set', path: ['models', 1, 'names', 0, 'images'], value: true })
    expect(editModel(learning, 1, 0, listed('qwen3:32b'))).toContainEqual({ kind: 'delete', path: ['models', 1, 'names', 0, 'images'] })
    expect(addModels(learning, 1, [{ ...listed('vision'), images: true }])[0]).toMatchObject({ value: { name: 'vision', images: true } })
  })

  it('writes the key in the file, and removes it when emptied', () => {
    expect(editProvider(learning, 1, { provider: 'local', type: 'openai', baseUrl: '', apiKey: 'sk-local' })).toContainEqual({ kind: 'set', path: ['models', 1, 'api_key'], value: 'sk-local' })
    expect(editProvider(learning, 0, { provider: 'deepseek', type: 'openai', baseUrl: '', apiKey: '' })).toContainEqual({ kind: 'delete', path: ['models', 0, 'api_key'] })
  })

  it('removes a provider with its last model', () => {
    expect(removeModel(learning, 1, 0)).toEqual([{ kind: 'delete', path: ['models', 1] }])
    expect(removeModel(learning, 0, 1)).toEqual([{ kind: 'delete', path: ['models', 0, 'names', 1] }])
  })

  it('keeps the memory model while learning uses it, and drops it otherwise', () => {
    expect(cannotRemove(learning, 0, 0)).toBe('memoryModel')
    expect(cannotRemoveProvider(learning, 0)).toBe('memoryModels')
    expect(cannotRemove(notLearning, 0, 0)).toBeUndefined()
    expect(removeProvider(notLearning, 0)).toContainEqual({ kind: 'delete', path: ['memory', 'model'] })
    expect(removeModel(notLearning, 0, 1).some((c) => c.path[0] === 'memory')).toBe(false)
  })

  it('refuses to remove the only model', () => {
    const one = { ...notLearning, models: [notLearning.models![1]!] }
    expect(cannotRemove(one, 0, 0)).toBe('lastModel')
    expect(cannotRemoveProvider(one, 0)).toBe('lastModel')
  })

  it('makes a model the default by moving it and its provider first', () => {
    expect(makeDefault(1, 0)).toEqual([{ kind: 'move', path: ['models', 1], to: 0 }])
    expect(makeDefault(0, 1)).toEqual([{ kind: 'move', path: ['models', 0, 'names', 1], to: 0 }])
  })
})
