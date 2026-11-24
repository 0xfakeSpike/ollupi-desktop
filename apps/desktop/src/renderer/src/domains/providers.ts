// Edits to the models the backend serves: config.yaml's providers, the
// deployment's catalog that every profile runs on. They follow the backend's
// rules: providers have distinct names without '/', each speaks one API type
// and serves at least one model, a model is selected by its id,
// provider/name. A provider's API key is written in the file, like its base
// URL. Saving one (applyProviders) reloads the providers into the running
// backend, so turns go on. Which model a profile starts and learns with is its
// own choice, in its settings (domains/settings).

import type { ApiType, BackendConfig, ConfigChange } from '../../../shared/ipc'

export type Provider = NonNullable<BackendConfig['providers']>[number]
export type ProviderModel = NonNullable<Provider['models']>[number]

export const modelId = (provider: string, name: string): string => `${provider}/${name}`

export interface ProviderFields {
  provider: string
  type: ApiType
  baseUrl: string
  /** Empty for an API without a key. */
  apiKey: string
}

export interface ModelFields {
  name: string
  calls: number | undefined
  thinking: boolean | undefined
  /** The model accepts images; ollupi sends it none otherwise. */
  images: boolean
  /** The context window, the most an answer may take of it, and the most
   * input the model takes when that is less than the window leaves, in tokens. */
  limits: { context: number; output: number; input?: number }
}

/** A model's limits as typed. */
export interface TypedLimits {
  context: string
  input: string
  output: string
}

/** For a model whose API does not say: a window most current models reach,
 * and an answer every API takes as its max_tokens. */
export const DEFAULT_CONTEXT = 128_000
const DEFAULT_OUTPUT = 8_192

/** The output a window of this size defaults to, leaving most of it to input. */
export const defaultOutput = (context: number) => Math.min(DEFAULT_OUTPUT, Math.floor(context / 4))

export const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : undefined)

/** Limits as ollupi takes them, or undefined for typed ones it would refuse.
 * Context and output take their defaults when empty; max input stays out,
 * as ollupi then goes by the window. */
export function limitsOf({ context, input, output }: TypedLimits): ModelFields['limits'] | undefined {
  const c = context.trim() ? count(context) : DEFAULT_CONTEXT
  if (!c) return undefined
  const o = output.trim() ? count(output) : defaultOutput(c)
  const i = count(input)
  if (!o || (input.trim() && !i)) return undefined
  return { context: c, output: o, ...(i && { input: i }) }
}

/** The models of Anthropic's and Gemini's APIs all take images; an
 * OpenAI-compatible API's may or may not. */
export function imagesByDefault(type: ApiType): boolean {
  return type !== 'openai'
}

/** A provider's type as config.yaml has it; the backend refuses any other. */
export function apiTypeOf(p: Provider): ApiType {
  return p.type as ApiType
}

export const providersOf = (c: BackendConfig): Provider[] => c.providers ?? []

function modelValue(m: ModelFields): ProviderModel {
  return {
    name: m.name,
    ...(m.calls !== undefined && { calls: m.calls }),
    ...(m.thinking !== undefined && { thinking: m.thinking }),
    ...(m.images && { images: true }),
    limits: m.limits,
  }
}

/** Sets a key to a value, or removes it when there is none. */
function setOrDelete(path: (string | number)[], value: unknown): ConfigChange {
  return value === undefined || value === '' ? { kind: 'delete', path } : { kind: 'set', path, value }
}

/** A provider serves at least one model, so it comes with its models. */
export function addProvider(c: BackendConfig, p: ProviderFields, models: ModelFields[]): ConfigChange[] {
  return [
    {
      kind: 'set',
      path: ['providers', providersOf(c).length],
      value: {
        id: p.provider,
        type: p.type,
        ...(p.baseUrl && { base_url: p.baseUrl }),
        ...(p.apiKey && { api_key: p.apiKey }),
        models: models.map(modelValue),
      },
    },
  ]
}

/** Renaming a provider renames its models: a profile that chose one of them,
 * and a conversation that ran one, must choose again. */
export function editProvider(_c: BackendConfig, index: number, p: ProviderFields): ConfigChange[] {
  const at = ['providers', index]
  return [
    { kind: 'set', path: [...at, 'id'], value: p.provider },
    { kind: 'set', path: [...at, 'type'], value: p.type },
    setOrDelete([...at, 'base_url'], p.baseUrl),
    setOrDelete([...at, 'api_key'], p.apiKey),
  ]
}

/** Appends models to a provider, after the ones it serves. */
export function addModels(c: BackendConfig, index: number, models: ModelFields[]): ConfigChange[] {
  const served = providersOf(c)[index]?.models?.length ?? 0
  return models.map((m, i) => ({ kind: 'set', path: ['providers', index, 'models', served + i], value: modelValue(m) }))
}

export function editModel(_c: BackendConfig, provider: number, index: number, m: ModelFields): ConfigChange[] {
  const at = ['providers', provider, 'models', index]
  return [
    { kind: 'set', path: [...at, 'name'], value: m.name },
    setOrDelete([...at, 'calls'], m.calls),
    setOrDelete([...at, 'thinking'], m.thinking),
    setOrDelete([...at, 'images'], m.images || undefined),
    { kind: 'set', path: [...at, 'limits'], value: m.limits },
  ]
}

/** A provider serves at least one model, so removing its last removes it. */
export function removeModel(c: BackendConfig, provider: number, index: number): ConfigChange[] {
  if ((providersOf(c)[provider]?.models?.length ?? 0) <= 1) return removeProvider(c, provider)
  return [{ kind: 'delete', path: ['providers', provider, 'models', index] }]
}

export function removeProvider(_c: BackendConfig, index: number): ConfigChange[] {
  return [{ kind: 'delete', path: ['providers', index] }]
}

const served = (c: BackendConfig): number => providersOf(c).reduce((n, p) => n + (p.models?.length ?? 0), 0)

/** The backend keeps serving at least one model, or no turn could run. */
export function cannotRemove(c: BackendConfig): 'lastModel' | undefined {
  return served(c) <= 1 ? 'lastModel' : undefined
}

export function cannotRemoveProvider(c: BackendConfig, index: number): 'lastModel' | undefined {
  return served(c) - (providersOf(c)[index]?.models?.length ?? 0) <= 0 ? 'lastModel' : undefined
}
