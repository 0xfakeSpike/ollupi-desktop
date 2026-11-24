// The model editor sees one profile's selected models while credentials stay
// shared. Operations below update credentials and this profile's selection.

import type { ApiType, BackendConfig, ConfigChange } from './ipc'

type Credential = NonNullable<BackendConfig['credentials']>[number]
type CredentialModel = NonNullable<Credential['models']>[number]
type ConfigProfile = NonNullable<BackendConfig['profiles']>[number]

export interface ProviderModel {
  name: string
  calls?: number | null
  thinking?: boolean | null
  images?: boolean
  limits: { context: number; output: number; input?: number }
}

export interface Provider {
  provider: string
  type: string
  base_url?: string
  api_key?: string
  names: ProviderModel[]
}

export interface ConfigModel {
  id: string
  provider: string
  name: string
}

export interface EditableConfig extends BackendConfig {
  models: Provider[]
  memory?: ConfigProfile['memory']
  profileIndex: number
  credentialIDs: string[]
}

export interface ProviderFields {
  provider: string
  type: ApiType
  baseUrl: string
  apiKey: string
}

export interface ModelFields {
  name: string
  calls: number | undefined
  thinking: boolean | undefined
  images: boolean
  limits: { context: number; output: number; input?: number }
}

export interface TypedLimits {
  context: string
  input: string
  output: string
}

export type ProfileConfigOperation =
  | { kind: 'addProvider'; provider: ProviderFields; models: ModelFields[] }
  | { kind: 'updateProvider'; index: number; provider: ProviderFields; models: ModelFields[] }
  | { kind: 'removeProvider'; index: number }
  | { kind: 'addModels'; provider: number; models: ModelFields[] }
  | { kind: 'editModel'; provider: number; index: number; model: ModelFields }
  | { kind: 'removeModel'; provider: number; index: number }
  | { kind: 'makeDefault'; provider: number; index: number }
  | { kind: 'setMemoryModel'; model: string }

export const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 8_192

export const defaultOutput = (context: number) => Math.min(DEFAULT_OUTPUT, Math.floor(context / 4))
export const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : undefined)

export function limitsOf({ context, input, output }: TypedLimits): ModelFields['limits'] | undefined {
  const c = context.trim() ? count(context) : DEFAULT_CONTEXT
  if (!c) return undefined
  const o = output.trim() ? count(output) : defaultOutput(c)
  const i = count(input)
  if (!o || (input.trim() && !i)) return undefined
  return { context: c, output: o, ...(i && { input: i }) }
}

export function imagesByDefault(type: ApiType): boolean {
  return type !== 'openai'
}

export function apiTypeOf(p: Provider): ApiType {
  return p.type as ApiType
}

export function modelId(credential: string, name: string): string {
  return `${credential}/${name}`
}

/** The selected profile's view: credentials contain only the models this
 * profile selected, while edits still land on the shared credential. */
export function profileConfig(config: BackendConfig, current: string | undefined): EditableConfig {
  const profiles = config.profiles ?? []
  const found = profiles.findIndex((p) => p.id === current)
  const profileIndex = found >= 0 ? found : 0
  const profile = profiles[profileIndex]
  if (!profile) throw new Error('the config has no profile')
  const credentials = new Map((config.credentials ?? []).map((c) => [c.id, c]))
  const groups = new Map<string, Provider>()
  const models: Provider[] = []
  for (const id of profile.models ?? []) {
    const slash = id.indexOf('/')
    if (slash < 1) continue
    const credentialID = id.slice(0, slash)
    const name = id.slice(slash + 1)
    const credential = credentials.get(credentialID)
    const model = credential?.models?.find((m) => m.name === name)
    if (!credential || !model) continue
    let group = groups.get(credentialID)
    if (!group) {
      group = { provider: credential.id, type: credential.type, base_url: credential.base_url, api_key: credential.api_key, names: [] }
      groups.set(credentialID, group)
      models.push(group)
    }
    group.names.push(model)
  }
  return { ...config, models, memory: profile.memory, profileIndex, credentialIDs: (config.credentials ?? []).map((c) => c.id) }
}

/** A provider whose API account is already a credential adds its models to
 * that credential: one account has one client and one set of limits. */
export function addProvider(config: EditableConfig, p: ProviderFields, models: ModelFields[]): ConfigChange[] {
  const credentials = config.credentials ?? []
  const same = credentials.findIndex((c) => sameAccount(c, p))
  if (same >= 0) return addToCredential(config, same, models)
  const ids = models.map((m) => modelId(p.provider, m.name))
  return [
    {
      kind: 'set',
      path: ['credentials', credentials.length],
      value: {
        id: p.provider,
        type: p.type,
        ...(p.baseUrl && { base_url: p.baseUrl }),
        ...(p.apiKey && { api_key: p.apiKey }),
        models: models.map(modelValue),
      },
    },
    { kind: 'set', path: ['profiles', config.profileIndex, 'models'], value: [...(profileOf(config).models ?? []), ...ids] },
  ]
}

export function editProvider(config: EditableConfig, index: number, p: ProviderFields): ConfigChange[] {
  const credential = credentialOf(config, config.models[index]!.provider)
  const changes: ConfigChange[] = [
    { kind: 'set', path: ['credentials', credential.index, 'id'], value: p.provider },
    { kind: 'set', path: ['credentials', credential.index, 'type'], value: p.type },
    setOrDelete(['credentials', credential.index, 'base_url'], p.baseUrl),
    setOrDelete(['credentials', credential.index, 'api_key'], p.apiKey),
  ]
  if (p.provider !== credential.value.id) {
    for (const [profileIndex, profile] of (config.profiles ?? []).entries()) {
      const replaced = (profile.models ?? []).map((id) => renameModelID(id, credential.value.id, p.provider))
      changes.push({ kind: 'set', path: ['profiles', profileIndex, 'models'], value: replaced })
      const memory = renameModelID(profile.memory?.model ?? '', credential.value.id, p.provider)
      if (memory) changes.push({ kind: 'set', path: ['profiles', profileIndex, 'memory', 'model'], value: memory })
    }
  }
  return changes
}

/** Removing a provider removes its models from this profile; the credential
 * remains available to other profiles. */
export function removeProvider(config: EditableConfig, index: number): ConfigChange[] {
  const id = config.models[index]!.provider
  const models = (profileOf(config).models ?? []).filter((m) => modelCredential(m) !== id)
  const changes: ConfigChange[] = [{ kind: 'set', path: ['profiles', config.profileIndex, 'models'], value: models }]
  const used = (config.profiles ?? []).some((p, i) => i !== config.profileIndex && (p.models ?? []).some((m) => modelCredential(m) === id))
  if (!used) {
    const credential = credentialOf(config, id)
    changes.push({ kind: 'delete', path: ['credentials', credential.index] })
  }
  return changes
}

export function addModels(config: EditableConfig, provider: number, models: ModelFields[]): ConfigChange[] {
  const credential = credentialOf(config, config.models[provider]!.provider)
  const current = credential.value.models ?? []
  const changes = models.map((m, i): ConfigChange => ({
    kind: 'set',
    path: ['credentials', credential.index, 'models', current.length + i],
    value: modelValue(m),
  }))
  changes.push({
    kind: 'set',
    path: ['profiles', config.profileIndex, 'models'],
    value: [...(profileOf(config).models ?? []), ...models.map((m) => modelId(credential.value.id, m.name))],
  })
  return changes
}

export function editModel(config: EditableConfig, provider: number, index: number, m: ModelFields): ConfigChange[] {
  const credential = credentialOf(config, config.models[provider]!.provider)
  const old = credential.value.models![index]!
  const path = ['credentials', credential.index, 'models', index]
  const changes: ConfigChange[] = [
    { kind: 'set', path: [...path, 'name'], value: m.name },
    setOrDelete([...path, 'calls'], m.calls),
    setOrDelete([...path, 'thinking'], m.thinking),
    setOrDelete([...path, 'images'], m.images || undefined),
    { kind: 'set', path: [...path, 'limits'], value: m.limits },
  ]
  if (m.name !== old.name) changes.push(...renameSelectedModel(config, credential.value.id, old.name, m.name))
  return changes
}

/** Removing a model removes it from this profile's selection. The credential
 * keeps it for other profiles. */
export function removeModel(config: EditableConfig, provider: number, index: number): ConfigChange[] {
  const credential = config.models[provider]!
  const name = credential.names[index]!.name
  const id = modelId(credential.provider, name)
  const changes: ConfigChange[] = [
    { kind: 'set', path: ['profiles', config.profileIndex, 'models'], value: (profileOf(config).models ?? []).filter((m) => m !== id) },
  ]
  const used = (config.profiles ?? []).some((p, i) => i !== config.profileIndex && (p.models ?? []).includes(id))
  if (!used) {
    const target = credentialOf(config, credential.provider)
    if ((target.value.models ?? []).length === 1) {
      changes.push({ kind: 'delete', path: ['credentials', target.index] })
    } else {
      const modelIndex = target.value.models!.findIndex((m) => m.name === name)
      changes.push({ kind: 'delete', path: ['credentials', target.index, 'models', modelIndex] })
    }
  }
  return changes
}

export function makeDefault(config: EditableConfig, provider: number, index: number): ConfigChange[] {
  const id = selectedModel(config, provider, index)
  const models = [...(profileOf(config).models ?? [])]
  const from = models.indexOf(id)
  if (from <= 0) return []
  models.splice(0, 0, ...models.splice(from, 1))
  return [{ kind: 'set', path: ['profiles', config.profileIndex, 'models'], value: models }]
}

export function selectedModel(config: EditableConfig, provider: number, index: number): string {
  return modelId(config.models[provider]!.provider, config.models[provider]!.names[index]!.name)
}

export function cannotRemove(config: EditableConfig, provider: number, index: number): 'lastModel' | 'memoryModel' | undefined {
  const models = profileOf(config).models ?? []
  if (models.length <= 1) return 'lastModel'
  if (config.memory?.model === selectedModel(config, provider, index)) return 'memoryModel'
  return undefined
}

export function cannotRemoveProvider(config: EditableConfig, provider: number): 'lastModel' | 'memoryModels' | undefined {
  const credential = config.models[provider]!
  const selected = new Set(profileOf(config).models ?? [])
  const removed = credential.names.map((m) => modelId(credential.provider, m.name)).filter((id) => selected.has(id))
  if (selected.size - removed.length <= 0) return 'lastModel'
  if (removed.includes(config.memory?.model ?? '')) return 'memoryModels'
  return undefined
}

export function setMemoryModel(config: EditableConfig, id: string): ConfigChange[] {
  return [{ kind: 'set', path: ['profiles', config.profileIndex, 'memory', 'model'], value: id }]
}

/** Translate one domain operation into config changes. */
export function profileChanges(config: BackendConfig, current: string, op: ProfileConfigOperation): ConfigChange[] {
  const own = profileConfig(config, current)
  switch (op.kind) {
  case 'addProvider':
    return addProvider(own, op.provider, op.models)
  case 'updateProvider': {
    const old = own.models[op.index]!.provider
    const changes = [...editProvider(own, op.index, op.provider), ...addModels(own, op.index, op.models)]
    const models = (own.profiles![own.profileIndex]!.models ?? [])
      .map((id) => renameModelID(id, old, op.provider.provider))
      .concat(op.models.map((m) => modelId(op.provider.provider, m.name)))
    changes.push({ kind: 'set', path: ['profiles', own.profileIndex, 'models'], value: models })
    return changes
  }
  case 'removeProvider':
    return removeProvider(own, op.index)
  case 'addModels':
    return addModels(own, op.provider, op.models)
  case 'editModel':
    return editModel(own, op.provider, op.index, op.model)
  case 'removeModel':
    return removeModel(own, op.provider, op.index)
  case 'makeDefault':
    return makeDefault(own, op.provider, op.index)
  case 'setMemoryModel':
    return setMemoryModel(own, op.model)
  }
}

function sameAccount(c: Credential, p: ProviderFields): boolean {
  const base = (url: string | undefined) => (url ?? '').replace(/\/+$/, '')
  return c.type === p.type && base(c.base_url) === base(p.baseUrl) && (c.api_key ?? '') === p.apiKey
}

function addToCredential(config: EditableConfig, index: number, models: ModelFields[]): ConfigChange[] {
  const credential = config.credentials![index]!
  const known = credential.models ?? []
  const added = models.filter((m) => !known.some((k) => k.name === m.name))
  const selected = profileOf(config).models ?? []
  const ids = models.map((m) => modelId(credential.id, m.name)).filter((id) => !selected.includes(id))
  return [
    ...added.map((m, i): ConfigChange => ({ kind: 'set', path: ['credentials', index, 'models', known.length + i], value: modelValue(m) })),
    { kind: 'set', path: ['profiles', config.profileIndex, 'models'], value: [...selected, ...ids] },
  ]
}

function modelValue(m: ModelFields): CredentialModel {
  return {
    name: m.name,
    ...(m.calls !== undefined && { calls: m.calls }),
    ...(m.thinking !== undefined && { thinking: m.thinking }),
    ...(m.images && { images: true }),
    limits: m.limits,
  }
}

function setOrDelete(path: (string | number)[], value: unknown): ConfigChange {
  return value === undefined || value === '' ? { kind: 'delete', path } : { kind: 'set', path, value }
}

function profileOf(config: EditableConfig): ConfigProfile {
  return config.profiles![config.profileIndex]!
}

function credentialOf(config: EditableConfig, id: string): { value: Credential; index: number } {
  const index = (config.credentials ?? []).findIndex((c) => c.id === id)
  if (index < 0) throw new Error(`credential ${id} not found`)
  return { value: config.credentials![index]!, index }
}

function modelCredential(id: string): string {
  return id.slice(0, id.indexOf('/'))
}

function renameModelID(id: string, from: string, to: string): string {
  return id.startsWith(from + '/') ? to + id.slice(from.length) : id
}

function renameSelectedModel(config: EditableConfig, credential: string, from: string, to: string): ConfigChange[] {
  const changes: ConfigChange[] = []
  for (const [profileIndex, profile] of (config.profiles ?? []).entries()) {
    const oldID = modelId(credential, from)
    const newID = modelId(credential, to)
    const models = (profile.models ?? []).map((id) => (id === oldID ? newID : id))
    if (models.some((id, i) => id !== profile.models?.[i])) changes.push({ kind: 'set', path: ['profiles', profileIndex, 'models'], value: models })
    if (profile.memory?.model === oldID) changes.push({ kind: 'set', path: ['profiles', profileIndex, 'memory', 'model'], value: newID })
  }
  return changes
}
