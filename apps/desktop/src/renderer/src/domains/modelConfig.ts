// Edits to config.yaml's models, following the backend's rules: providers
// have distinct names and each serves at least one model; a model is
// selected by its id, provider/name; the first model of the first provider
// is the default; memory.model names one of the models by id. A provider's
// API key is written in the file, like its base URL.

import type { BackendConfig, ConfigChange } from '../../../shared/ipc'

export type Provider = NonNullable<BackendConfig['models']>[number]
export type ProviderModel = NonNullable<Provider['names']>[number]

/** The sidecar's config.ID. */
export const modelId = (provider: string, name: string): string => `${provider}/${name}`

export interface ProviderFields {
  provider: string
  baseUrl: string
  /** Empty for an API without a key. */
  apiKey: string
}

export interface ModelFields {
  name: string
  calls: number | undefined
  thinking: boolean | undefined
  /** The context window and the most an answer may take of it, in tokens. */
  limits: { context: number; output: number }
}

const providers = (c: BackendConfig): Provider[] => c.models ?? []

function modelValue(m: ModelFields): ProviderModel {
  return {
    name: m.name,
    ...(m.calls !== undefined && { calls: m.calls }),
    ...(m.thinking !== undefined && { thinking: m.thinking }),
    limits: m.limits,
  }
}

/** Sets a key to a value, or removes it when there is none. */
function setOrDelete(path: (string | number)[], value: unknown): ConfigChange {
  return value === undefined || value === '' ? { kind: 'delete', path } : { kind: 'set', path, value }
}

/** A provider serves at least one model, so it comes with its models. */
export function addProvider(config: BackendConfig, p: ProviderFields, models: ModelFields[]): ConfigChange[] {
  const value = {
    provider: p.provider,
    ...(p.baseUrl && { base_url: p.baseUrl }),
    ...(p.apiKey && { api_key: p.apiKey }),
    names: models.map(modelValue),
  }
  return [{ kind: 'set', path: ['models', providers(config).length], value }]
}

/** Renaming a provider changes its models' ids, so memory.model follows when
 * it names one of them. */
export function editProvider(config: BackendConfig, index: number, p: ProviderFields): ConfigChange[] {
  const old = providers(config)[index]!
  const changes: ConfigChange[] = [
    { kind: 'set', path: ['models', index, 'provider'], value: p.provider },
    setOrDelete(['models', index, 'base_url'], p.baseUrl),
    setOrDelete(['models', index, 'api_key'], p.apiKey),
  ]
  const memory = config.memory.model
  const used = (old.names ?? []).find((m) => modelId(old.provider, m.name) === memory)
  if (used && p.provider !== old.provider) {
    changes.push({ kind: 'set', path: ['memory', 'model'], value: modelId(p.provider, used.name) })
  }
  return changes
}

/** memory.model must name an existing model. With learning off nothing
 * uses it, so it goes with the model; with learning on, cannotRemove says
 * to choose another first. */
function forgetMemoryModel(config: BackendConfig, removed: string[]): ConfigChange[] {
  const m = config.memory.model
  return m && removed.includes(m) && !config.memory.generate ? [{ kind: 'delete', path: ['memory', 'model'] }] : []
}

export function removeProvider(config: BackendConfig, index: number): ConfigChange[] {
  const p = providers(config)[index]!
  const ids = (p.names ?? []).map((m) => modelId(p.provider, m.name))
  return [{ kind: 'delete', path: ['models', index] }, ...forgetMemoryModel(config, ids)]
}

/** Appends models to a provider, after the ones it serves. */
export function addModels(config: BackendConfig, provider: number, models: ModelFields[]): ConfigChange[] {
  const names = providers(config)[provider]!.names ?? []
  return models.map((m, i) => ({ kind: 'set', path: ['models', provider, 'names', names.length + i], value: modelValue(m) }))
}

/** Renaming a model changes its id, so memory.model follows when it names it. */
export function editModel(config: BackendConfig, provider: number, index: number, m: ModelFields): ConfigChange[] {
  const p = providers(config)[provider]!
  const old = p.names![index]!
  const path = ['models', provider, 'names', index]
  const changes: ConfigChange[] = [
    { kind: 'set', path: [...path, 'name'], value: m.name },
    setOrDelete([...path, 'calls'], m.calls),
    setOrDelete([...path, 'thinking'], m.thinking),
    { kind: 'set', path: [...path, 'limits'], value: m.limits },
  ]
  if (m.name !== old.name && config.memory.model === modelId(p.provider, old.name)) {
    changes.push({ kind: 'set', path: ['memory', 'model'], value: modelId(p.provider, m.name) })
  }
  return changes
}

/** A provider serves at least one model, so removing its last removes it. */
export function removeModel(config: BackendConfig, provider: number, index: number): ConfigChange[] {
  const p = providers(config)[provider]!
  if ((p.names ?? []).length === 1) return removeProvider(config, provider)
  return [{ kind: 'delete', path: ['models', provider, 'names', index] }, ...forgetMemoryModel(config, [modelId(p.provider, p.names![index]!.name)])]
}

/** The default is the first model of the first provider. */
export function makeDefault(provider: number, index: number): ConfigChange[] {
  const changes: ConfigChange[] = []
  if (index > 0) changes.push({ kind: 'move', path: ['models', provider, 'names', index], to: 0 })
  if (provider > 0) changes.push({ kind: 'move', path: ['models', provider], to: 0 })
  return changes
}

/** Why a model cannot be removed, if it cannot: the backend requires at
 * least one model (lastModel), and learning needs the model memory.model
 * names (memoryModel). */
export function cannotRemove(config: BackendConfig, provider: number, index: number): 'lastModel' | 'memoryModel' | undefined {
  const p = providers(config)[provider]!
  if (providers(config).reduce((n, q) => n + (q.names ?? []).length, 0) === 1) return 'lastModel'
  if (config.memory.generate && config.memory.model === modelId(p.provider, p.names![index]!.name)) return 'memoryModel'
  return undefined
}

/** cannotRemove for every model of a provider. */
export function cannotRemoveProvider(config: BackendConfig, provider: number): 'lastModel' | 'memoryModels' | undefined {
  const p = providers(config)[provider]!
  const others = providers(config).reduce((n, q, i) => n + (i === provider ? 0 : (q.names ?? []).length), 0)
  if (others === 0) return 'lastModel'
  if (config.memory.generate && (p.names ?? []).some((m) => config.memory.model === modelId(p.provider, m.name))) return 'memoryModels'
  return undefined
}
