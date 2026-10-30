// Which models a provider serves, from its API's model list, asked the way
// the backend's client for that API talks to it. Asked from the main
// process: the API would not answer the renderer's origin.

import type { ApiType, ListedModel, ModelList } from '../shared/ipc'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

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
  const base = baseUrl.trim() || api.base
  if (!/^https?:\/\//i.test(base)) return { ok: false, error: 'The base URL must start with http:// or https://' }
  try {
    const res = await fetch(api.url(base.replace(/\/+$/, '')), { headers: api.headers(apiKey.trim()), signal: AbortSignal.timeout(15_000) })
    const text = await res.text()
    const body = parse(text)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${apiError(body) ?? (text.trim().slice(0, 200) || res.statusText)}` }
    const models = api.models(body)
    return models ? { ok: true, models } : { ok: false, error: 'The API did not answer with a model list.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** An OpenAI-compatible list, {"data": [{"id": ...}]}, sorted by id
 * and without repeats. A model's limits
 * come from context_window and max_output_tokens, which some APIs
 * (DeepSeek) add to each model; a model without both has none. */
export function listedModels(body: unknown): ListedModel[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data
  if (!Array.isArray(data)) return undefined
  return sorted((data as { id?: unknown; context_window?: unknown; max_output_tokens?: unknown }[]).map((m) => model(m?.id, m?.context_window, m?.max_output_tokens)))
}

/** Anthropic's list, {"data": [{"id": ...}]}, with max_input_tokens and
 * max_tokens where it gives them. */
export function anthropicModels(body: unknown): ListedModel[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data
  if (!Array.isArray(data)) return undefined
  return sorted((data as { id?: unknown; max_input_tokens?: unknown; max_tokens?: unknown }[]).map((m) => model(m?.id, m?.max_input_tokens, m?.max_tokens)))
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
      .map((m) => model(typeof m.name === 'string' ? m.name.replace(/^models\//, '') : undefined, m.inputTokenLimit, m.outputTokenLimit)),
  )
}

/** A model by its name; ones without a name are dropped by sorted. */
function model(name: unknown, context: unknown, output: unknown): ListedModel {
  const [c, o] = [tokens(context), tokens(output)]
  return { name: typeof name === 'string' ? name : '', ...(c && o && { limits: { context: c, output: o } }) }
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
