// Edits to the deployment's catalog: the providers every profile runs on,
// each an API account with its key, and the models each serves. They follow
// ollupi's rules: providers have distinct names without '/', each speaks
// one API and serves at least one model, a model is selected by its id,
// provider/name. Each edit gives the catalog as it would be; the operator
// saves it whole (domains/catalog). Which model a profile starts and learns
// with is its own choice, in its settings (domains/settings).

import type { ModelProviderRow, ProviderModel as ProviderModelRow } from '@ollupi/protocol'
import type { ApiType } from '../../../shared/ipc'

export type Provider = ModelProviderRow
export type ProviderModel = ProviderModelRow

export const modelId = (provider: string, name: string): string => `${provider}/${name}`

/** The models a provider serves, in order. */
export const modelsOf = (p: Provider): ProviderModel[] => p.models ?? []

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

/** The API a provider speaks. */
export function apiTypeOf(p: Provider): ApiType {
  return p.api
}

function modelValue(m: ModelFields): ProviderModel {
  return {
    name: m.name,
    ...(m.calls !== undefined && { calls: m.calls }),
    ...(m.thinking !== undefined && { thinking: m.thinking }),
    ...(m.images && { images: true }),
    limits: m.limits,
  }
}

function providerValue(p: ProviderFields, models: ProviderModel[]): Provider {
  return { id: p.provider, api: p.type, ...(p.baseUrl && { baseUrl: p.baseUrl }), ...(p.apiKey && { apiKey: p.apiKey }), models }
}

/** A provider serves at least one model, so it comes with its models. */
export function addProvider(list: Provider[], p: ProviderFields, models: ModelFields[]): Provider[] {
  return [...list, providerValue(p, models.map(modelValue))]
}

/** Renaming a provider renames its models: a profile that chose one of them,
 * and a conversation that ran one, must choose again. */
export function editProvider(list: Provider[], index: number, p: ProviderFields): Provider[] {
  return list.map((o, i) => (i === index ? providerValue(p, modelsOf(o)) : o))
}

/** Appends models to a provider, after the ones it serves. */
export function addModels(list: Provider[], index: number, models: ModelFields[]): Provider[] {
  return list.map((o, i) => (i === index ? { ...o, models: [...modelsOf(o), ...models.map(modelValue)] } : o))
}

export function editModel(list: Provider[], provider: number, index: number, m: ModelFields): Provider[] {
  return list.map((o, i) => (i === provider ? { ...o, models: modelsOf(o).map((n, j) => (j === index ? modelValue(m) : n)) } : o))
}

/** A provider serves at least one model, so removing its last removes it. */
export function removeModel(list: Provider[], provider: number, index: number): Provider[] {
  const p = list[provider]
  if (!p || modelsOf(p).length <= 1) return removeProvider(list, provider)
  return list.map((o, i) => (i === provider ? { ...o, models: modelsOf(o).filter((_, j) => j !== index) } : o))
}

export function removeProvider(list: Provider[], index: number): Provider[] {
  return list.filter((_, i) => i !== index)
}

const served = (list: Provider[]): number => list.reduce((n, p) => n + modelsOf(p).length, 0)

/** The deployment keeps serving at least one model, or no turn could run. */
export function cannotRemove(list: Provider[]): 'lastModel' | undefined {
  return served(list) <= 1 ? 'lastModel' : undefined
}

export function cannotRemoveProvider(list: Provider[], index: number): 'lastModel' | undefined {
  const p = list[index]
  return served(list) - (p ? modelsOf(p).length : 0) <= 0 ? 'lastModel' : undefined
}
