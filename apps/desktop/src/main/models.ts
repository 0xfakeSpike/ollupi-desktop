// Which models a provider serves, from its API's model list, asked the way
// the backend's client for that API talks to it. Asked from the main
// process: the API would not answer the renderer's origin.

import { errorMessage } from '@ollupi/client'
import type { ApiType, ListedModel, ModelList } from '../shared/ipc'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const TIMEOUT_MS = 15_000
const BAILIAN_PAGE_SIZE = 100

interface Api {
  /** The backend's client uses this when base_url is empty. */
  base: string
  url(base: string): string
  headers(key: string): Record<string, string>
  models(body: unknown): ListedModel[] | undefined
}

const apis: Record<ApiType, Api> = {
  // GET {base_url}/models; base_url includes the version (…/v1).
  openai: {
    base: 'https://api.openai.com/v1',
    url: (base) => `${base}/models`,
    headers: (key): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : {}),
    models: listedModels,
  },
  // GET {base_url}/v1/models, as the Anthropic SDK puts the version in its paths.
  anthropic: {
    base: 'https://api.anthropic.com',
    url: (base) => `${base}/v1/models?limit=1000`,
    headers: (key): Record<string, string> => ({ 'anthropic-version': '2023-06-01', ...(key && { 'x-api-key': key }) }),
    models: anthropicModels,
  },
  // GET {base_url}/v1beta/models, the version the Gemini API's SDK uses.
  gemini: {
    base: 'https://generativelanguage.googleapis.com',
    url: (base) => `${base}/v1beta/models?pageSize=1000`,
    headers: (key): Record<string, string> => (key ? { 'x-goog-api-key': key } : {}),
    models: geminiModels,
  },
}

/** fetch is Electron's, so the request goes through the system's proxy. */
export async function listModels(fetch: Fetch, type: ApiType, baseUrl: string, apiKey: string): Promise<ModelList> {
  const api = apis[type]
  const base = (baseUrl.trim() || api.base).replace(/\/+$/, '')
  const key = apiKey.trim()
  if (!/^https?:\/\//i.test(base)) return { ok: false, error: 'The base URL must start with http:// or https://' }
  try {
    const origin = type === 'openai' ? bailianOrigin(base) : undefined
    const bailian = origin ? await bailianModels(fetch, origin, api.headers(key)) : undefined
    if (bailian?.length) return { ok: true, models: bailian }
    const res = await fetch(api.url(base), { headers: api.headers(key), signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = await res.text()
    const body = parse(text)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${apiError(body) ?? (text.trim().slice(0, 200) || res.statusText)}` }
    const models = api.models(body)
    return models ? { ok: true, models } : { ok: false, error: 'The API did not answer with a model list.' }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

/** The limits some APIs add to a listed model, each of them optional. */
interface ModelInfo {
  context_window?: unknown
  max_input_tokens?: unknown
  max_output_tokens?: unknown
}

/** An OpenAI-compatible list, {"data": [{"id": ...}]}, sorted by id and
 * without repeats. A model's limits sit on the model (DeepSeek) or in its
 * model_info (Bailian). */
export function listedModels(body: unknown): ListedModel[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data
  if (!Array.isArray(data)) return undefined
  return sorted((data as (ModelInfo & { id?: unknown; model_info?: ModelInfo | null })[]).map((m) => infoModel(m?.id, m?.model_info ?? m)))
}

/** Bailian's own list, {"output": {"total": 168, "models": [{"model": ...}]}}:
 * only the models that answer in text, as it also lists image and video ones. */
export function bailianPage(body: unknown): { models: ListedModel[]; listed: number; total: unknown } | undefined {
  const output = (body as { output?: { models?: unknown; total?: unknown } } | undefined)?.output
  if (!Array.isArray(output?.models)) return undefined
  const page = output.models as { model?: unknown; model_info?: ModelInfo | null; inference_metadata?: { response_modality?: unknown } }[]
  const models = page
    .filter((m) => {
      const modality = m?.inference_metadata?.response_modality
      return !Array.isArray(modality) || modality.includes('Text')
    })
    .map((m) => infoModel(m?.model, m?.model_info))
  return { models, listed: page.length, total: output.total }
}

/** Where Bailian's own API is, for a base URL of its OpenAI-compatible mode. */
function bailianOrigin(base: string): string | undefined {
  const url = new URL(base)
  return url.hostname.endsWith('.aliyuncs.com') && url.pathname === '/compatible-mode/v1' ? url.origin : undefined
}

/** All pages of Bailian's own list, the one that says a model's limits.
 * Undefined when it cannot be had: its documentation gives it workspace
 * hosts, so the compatible mode's list is still asked then. */
async function bailianModels(fetch: Fetch, origin: string, headers: Record<string, string>): Promise<ListedModel[] | undefined> {
  const models: ListedModel[] = []
  let listed = 0
  try {
    for (let page = 1; ; page++) {
      const res = await fetch(`${origin}/api/v1/models?page_no=${page}&page_size=${BAILIAN_PAGE_SIZE}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      const answer = res.ok ? bailianPage(parse(await res.text())) : undefined
      if (!answer) return undefined
      models.push(...answer.models)
      listed += answer.listed
      if (answer.listed === 0 || typeof answer.total !== 'number' || listed >= answer.total) return sorted(models)
    }
  } catch {
    return undefined
  }
}

/** Anthropic's list, {"data": [{"id": ...}]}, with max_input_tokens and
 * max_tokens where it gives them. */
export function anthropicModels(body: unknown): ListedModel[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data
  if (!Array.isArray(data)) return undefined
  return sorted((data as { id?: unknown; max_input_tokens?: unknown; max_tokens?: unknown }[]).map((m) => model(m?.id, { context: m?.max_input_tokens, output: m?.max_tokens })))
}

/** The Gemini API's list, {"models": [{"name": "models/…"}]}: only the
 * models that generate content, by the name a request gives them, with
 * inputTokenLimit and outputTokenLimit. */
export function geminiModels(body: unknown): ListedModel[] | undefined {
  const list = (body as { models?: unknown } | undefined)?.models
  if (!Array.isArray(list)) return undefined
  return sorted(
    (list as { name?: unknown; inputTokenLimit?: unknown; outputTokenLimit?: unknown; supportedGenerationMethods?: unknown }[])
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => model(typeof m.name === 'string' ? m.name.replace(/^models\//, '') : undefined, { context: m.inputTokenLimit, output: m.outputTokenLimit })),
  )
}

const infoModel = (name: unknown, info: ModelInfo | null | undefined): ListedModel =>
  model(name, { context: info?.context_window, input: info?.max_input_tokens, output: info?.max_output_tokens })

/** A model by its name, with the limits that are token counts; ones without
 * a name are dropped by sorted. */
function model(name: unknown, given: { context?: unknown; input?: unknown; output?: unknown }): ListedModel {
  const limits = Object.fromEntries(Object.entries(given).filter(([, v]) => tokens(v))) as ListedModel['limits'] & object
  return { name: typeof name === 'string' ? name : '', ...(Object.keys(limits).length > 0 && { limits }) }
}

/** Sorted by name, once each, without nameless ones. */
function sorted(models: ListedModel[]): ListedModel[] {
  const byName = new Map<string, ListedModel>()
  for (const m of models) if (m.name && !byName.has(m.name)) byName.set(m.name, m)
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const tokens = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined)

/** An error's message, as OpenAI, Anthropic and Gemini all word it:
 * {"error": {"message": ...}}. */
function apiError(body: unknown): string | undefined {
  const error = (body as { error?: unknown } | undefined)?.error
  const message = typeof error === 'string' ? error : (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' && message ? message : undefined
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
