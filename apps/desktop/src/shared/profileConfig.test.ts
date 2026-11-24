import { describe, expect, it } from 'vitest'
import type { BackendConfig } from './ipc'
import {
  addModels,
  addProvider,
  cannotRemove,
  cannotRemoveProvider,
  editModel,
  editProvider,
  limitsOf,
  makeDefault,
  profileConfig,
  profileChanges,
  removeModel,
  removeProvider,
  setMemoryModel,
  type ModelFields,
} from './profileConfig'

const limits = { context: 128_000, output: 16_384 }
const listed = (name: string): ModelFields => ({ name, calls: undefined, thinking: undefined, images: false, limits })

const base = (): BackendConfig => ({
  schema_version: 2,
  name: 'ollupi',
  credentials: [
    { id: 'deepseek', type: 'openai', api_key: 'sk-test', models: [{ name: 'deepseek-flash', limits }, { name: 'deepseek-pro', limits }] },
    { id: 'local', type: 'openai', models: [{ name: 'qwen3:32b', limits }] },
  ],
  profiles: [
    { id: 'default', name: '', color: 'stone', models: ['deepseek/deepseek-flash', 'deepseek/deepseek-pro', 'local/qwen3:32b'], memory: { model: 'deepseek/deepseek-flash' } },
    { id: 'work', name: 'Work', color: 'teal', models: ['local/qwen3:32b'] },
  ],
  workspace: { enabled: true, workspace_dirs: null, command_timeout_sec: 60, command_blacklist: null },
})

const config = () => profileConfig(base(), 'default')

describe('model edits', () => {
  it('shows only the current profile selections', () => {
    expect(config().models.map((p) => [p.provider, p.names.map((m) => m.name)])).toEqual([
      ['deepseek', ['deepseek-flash', 'deepseek-pro']],
      ['local', ['qwen3:32b']],
    ])
    expect(profileConfig(base(), 'work').models).toEqual([expect.objectContaining({ provider: 'local' })])
  })

  it('adds a credential and selects its models for the current profile', () => {
    const changes = addProvider(config(), { provider: 'openai', type: 'openai', baseUrl: '', apiKey: 'sk-openai' }, [listed('gpt-5.2')])
    expect(changes[0]).toMatchObject({ path: ['credentials', 2], value: { id: 'openai', models: [{ name: 'gpt-5.2' }] } })
    expect(changes[1]).toMatchObject({ path: ['profiles', 0, 'models'], value: ['deepseek/deepseek-flash', 'deepseek/deepseek-pro', 'local/qwen3:32b', 'openai/gpt-5.2'] })
  })

  it('adds models to the credential that already holds the same API key', () => {
    const changes = addProvider(profileConfig(base(), 'work'), { provider: 'ds', type: 'openai', baseUrl: '', apiKey: 'sk-test' }, [listed('deepseek-flash'), listed('deepseek-chat')])
    expect(changes).toEqual([
      { kind: 'set', path: ['credentials', 0, 'models', 2], value: { name: 'deepseek-chat', limits } },
      { kind: 'set', path: ['profiles', 1, 'models'], value: ['local/qwen3:32b', 'deepseek/deepseek-flash', 'deepseek/deepseek-chat'] },
    ])
  })

  it('renames a shared credential and every selected id', () => {
    expect(editProvider(config(), 0, { provider: 'ds', type: 'openai', baseUrl: '', apiKey: 'sk-test' })).toContainEqual({
      kind: 'set',
      path: ['profiles', 0, 'models'],
      value: ['ds/deepseek-flash', 'ds/deepseek-pro', 'local/qwen3:32b'],
    })
  })

  it('renames a credential and adds models in one operation', () => {
    const changes = profileChanges(base(), 'default', {
      kind: 'updateProvider',
      index: 0,
      provider: { provider: 'ds', type: 'openai', baseUrl: '', apiKey: 'sk-test' },
      models: [listed('new-model')],
    })
    expect(changes.at(-1)).toEqual({
      kind: 'set',
      path: ['profiles', 0, 'models'],
      value: ['ds/deepseek-flash', 'ds/deepseek-pro', 'local/qwen3:32b', 'ds/new-model'],
    })
  })

  it('adds models to a credential and the current profile', () => {
    const changes = addModels(config(), 0, [listed('deepseek-chat')])
    expect(changes[0]).toMatchObject({ path: ['credentials', 0, 'models', 2], value: { name: 'deepseek-chat' } })
    expect(changes.at(-1)).toMatchObject({ path: ['profiles', 0, 'models'], value: expect.arrayContaining(['deepseek/deepseek-chat']) })
  })

  it('renames a model and updates profile selections and memory', () => {
    const fields = { name: 'deepseek-v4-flash', calls: undefined, thinking: undefined, images: false, limits }
    const changes = editModel(config(), 0, 0, fields)
    expect(changes).toContainEqual({ kind: 'set', path: ['credentials', 0, 'models', 0, 'name'], value: 'deepseek-v4-flash' })
    expect(changes).toContainEqual({ kind: 'set', path: ['profiles', 0, 'memory', 'model'], value: 'deepseek/deepseek-v4-flash' })
  })

  it('removes models or providers only from this profile', () => {
    expect(removeModel(config(), 0, 1)).toEqual([
      { kind: 'set', path: ['profiles', 0, 'models'], value: ['deepseek/deepseek-flash', 'local/qwen3:32b'] },
      { kind: 'delete', path: ['credentials', 0, 'models', 1] },
    ])
    expect(removeProvider(config(), 1)).toEqual([
      { kind: 'set', path: ['profiles', 0, 'models'], value: ['deepseek/deepseek-flash', 'deepseek/deepseek-pro'] },
    ])
  })

  it('protects the last model and the learning model', () => {
    expect(cannotRemove(config(), 0, 0)).toBe('memoryModel')
    expect(cannotRemoveProvider(config(), 1)).toBeUndefined()
    expect(cannotRemove(profileConfig(base(), 'work'), 0, 0)).toBe('lastModel')
  })

  it('makes a selected model default and sets memory', () => {
    expect(makeDefault(config(), 1, 0)).toEqual([
      { kind: 'set', path: ['profiles', 0, 'models'], value: ['local/qwen3:32b', 'deepseek/deepseek-flash', 'deepseek/deepseek-pro'] },
    ])
    expect(setMemoryModel(config(), 'local/qwen3:32b')).toEqual([
      { kind: 'set', path: ['profiles', 0, 'memory', 'model'], value: 'local/qwen3:32b' },
    ])
  })
})

describe('limitsOf', () => {
  const typed = (context = '', output = '', input = '') => ({ context, input, output })

  it('takes defaults and keeps typed values', () => {
    expect(limitsOf(typed())).toEqual({ context: 128_000, output: 8_192 })
    expect(limitsOf(typed('1000000'))).toEqual({ context: 1_000_000, output: 8_192 })
    expect(limitsOf(typed('131072', '16384', '130048'))).toEqual({ context: 131_072, output: 16_384, input: 130_048 })
  })

  it('refuses invalid limits', () => {
    expect(limitsOf(typed('abc'))).toBeUndefined()
    expect(limitsOf(typed('1000', '100', '0'))).toBeUndefined()
  })
})
