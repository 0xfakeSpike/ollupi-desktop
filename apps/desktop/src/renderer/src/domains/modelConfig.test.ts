import { describe, expect, it } from 'vitest'
import type { BackendConfig } from '../../../shared/ipc'
import { cannotRemove, cannotRemoveProvider, editModel, editProvider, makeDefault, removeModel, removeProvider } from './modelConfig'

const config = (memory: BackendConfig['memory']): BackendConfig =>
  ({
    name: 'ollupi',
    models: [
      { provider: 'deepseek', api_key_env: 'DEEPSEEK_API_KEY', names: [{ name: 'deepseek-flash' }, { name: 'deepseek-pro' }] },
      { provider: 'local', names: [{ name: 'qwen3:32b' }] },
    ],
    permissions: {},
    shell: { enabled: true, workspace_dirs: null, command_timeout_sec: 60, command_blacklist: null },
    memory,
  }) as BackendConfig

const learning = config({ use: true, generate: true, model: 'deepseek/deepseek-flash' })
const notLearning = config({ use: true, generate: false, model: 'deepseek/deepseek-flash' })

describe('model edits', () => {
  it('moves memory.model along when its provider is renamed', () => {
    expect(editProvider(learning, 0, { provider: 'ds', baseUrl: '', keyEnv: 'DEEPSEEK_API_KEY' })).toContainEqual({
      kind: 'set',
      path: ['memory', 'model'],
      value: 'ds/deepseek-flash',
    })
    expect(editProvider(learning, 1, { provider: 'ollama', baseUrl: '', keyEnv: '' }).some((c) => c.path[0] === 'memory')).toBe(false)
  })

  it('moves memory.model along when its model is renamed', () => {
    const fields = { name: 'deepseek-v4-flash', calls: undefined, thinking: undefined, limits: undefined }
    expect(editModel(learning, 0, 0, fields)).toContainEqual({ kind: 'set', path: ['memory', 'model'], value: 'deepseek/deepseek-v4-flash' })
    expect(editModel(learning, 0, 1, { ...fields, name: 'x' }).some((c) => c.path[0] === 'memory')).toBe(false)
  })

  it('names a key variable in place of a key written in the file', () => {
    expect(editProvider(learning, 1, { provider: 'local', baseUrl: '', keyEnv: 'LOCAL_KEY' })).toContainEqual({ kind: 'delete', path: ['models', 1, 'api_key'] })
    expect(editProvider(learning, 1, { provider: 'local', baseUrl: '', keyEnv: '' })).toContainEqual({ kind: 'delete', path: ['models', 1, 'api_key_env'] })
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
