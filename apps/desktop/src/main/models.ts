// Which models a provider serves, from its OpenAI-compatible API's model
// list. Asked from the main process: the API would not answer the
// renderer's origin.

import type { ListedModel, ModelList } from '../shared/ipc'

/** The backend's client uses OpenAI's API when base_url is empty. */
const OPENAI = 'https://api.openai.com/v1'

/** GET {base_url}/models, sending the key as the backend would. fetch is
 * Electron's, so the request goes through the system's proxy. */
export async function listModels(fetch: (url: string, init: RequestInit) => Promise<Response>, baseUrl: string, apiKey: string): Promise<ModelList> {
  const base = baseUrl.trim() || OPENAI
  if (!/^https?:\/\//i.test(base)) return { ok: false, error: 'The base URL must start with http:// or https://' }
  const key = apiKey.trim()
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    const body = parse(text)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${apiError(body) ?? (text.trim().slice(0, 200) || res.statusText)}` }
    const models = listedModels(body)
    return models ? { ok: true, models } : { ok: false, error: 'The API did not answer with a model list.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The models of {"data": [{"id": ...}]}, the list's shape, sorted by id
 * and without repeats; undefined for any other answer. A model's limits come
 * from context_window and max_output_tokens, which some APIs (DeepSeek) add
 * to each model; a model without both has none. */
export function listedModels(body: unknown): ListedModel[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data
  if (!Array.isArray(data)) return undefined
  const byName = new Map<string, ListedModel>()
  for (const m of data as { id?: unknown; context_window?: unknown; max_output_tokens?: unknown }[]) {
    if (typeof m?.id !== 'string' || m.id === '' || byName.has(m.id)) continue
    const context = tokens(m.context_window)
    const output = tokens(m.max_output_tokens)
    byName.set(m.id, { name: m.id, ...(context && output && { limits: { context, output } }) })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const tokens = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined)

/** An OpenAI-style error's message: {"error": {"message": ...}}. */
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
