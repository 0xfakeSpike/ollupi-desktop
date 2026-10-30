import { describe, expect, it } from 'vitest'
import { anthropicModels, geminiModels, listedModels, listModels } from './models'

/** A fetch that records what it was asked and answers with status and body. */
function api(status: number, body: string) {
  const asked: { url: string; init: RequestInit }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    asked.push({ url, init })
    return new Response(body, { status })
  }
  return { fetch, asked }
}

describe('listModels', () => {
  it('asks {base_url}/models with the key, as the backend would', async () => {
    const { fetch, asked } = api(200, JSON.stringify({ object: 'list', data: [{ id: 'deepseek-pro' }, { id: 'deepseek-flash' }] }))
    expect(await listModels(fetch, 'openai', ' https://api.deepseek.com/ ', ' sk-test ')).toEqual({
      ok: true,
      models: [{ name: 'deepseek-flash' }, { name: 'deepseek-pro' }],
    })
    expect(asked[0]!.url).toBe('https://api.deepseek.com/models')
    expect(asked[0]!.init.headers).toEqual({ Authorization: 'Bearer sk-test' })
  })

  it('asks OpenAI for an empty base URL, and sends no key for an API without one', async () => {
    const openai = api(200, '{"data":[]}')
    await listModels(openai.fetch, 'openai', '', 'sk-test')
    expect(openai.asked[0]!.url).toBe('https://api.openai.com/v1/models')
    const local = api(200, '{"data":[]}')
    await listModels(local.fetch, 'openai', 'http://127.0.0.1:11434/v1', '')
    expect(local.asked[0]!.init.headers).toEqual({})
  })

  it('asks Anthropic and Gemini as their SDKs would, at their own default URLs', async () => {
    const anthropic = api(200, JSON.stringify({ data: [{ type: 'model', id: 'claude-sonnet-5-5' }], has_more: false }))
    expect(await listModels(anthropic.fetch, 'anthropic', '', 'sk-ant')).toEqual({ ok: true, models: [{ name: 'claude-sonnet-5-5' }] })
    expect(anthropic.asked[0]!.url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(anthropic.asked[0]!.init.headers).toEqual({ 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant' })
    const gemini = api(200, '{"models":[]}')
    await listModels(gemini.fetch, 'gemini', '', 'AIza')
    expect(gemini.asked[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    expect(gemini.asked[0]!.init.headers).toEqual({ 'x-goog-api-key': 'AIza' })
  })

  it('says why the API refused', async () => {
    const { fetch } = api(401, JSON.stringify({ error: { message: 'Incorrect API key provided' } }))
    expect(await listModels(fetch, 'openai', 'https://api.openai.com/v1', 'sk-bad')).toEqual({ ok: false, error: 'HTTP 401: Incorrect API key provided' })
    expect(await listModels(api(404, 'not found').fetch, 'openai', 'https://example.com', '')).toEqual({ ok: false, error: 'HTTP 404: not found' })
  })

  it('refuses a base URL that is not http(s) without asking', async () => {
    const { fetch, asked } = api(200, '{"data":[]}')
    expect((await listModels(fetch, 'openai', 'api.deepseek.com', '')).ok).toBe(false)
    expect(asked).toHaveLength(0)
  })

  it('reports a failed request', async () => {
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.example.com')
    }
    expect(await listModels(fetch, 'openai', 'https://api.example.com', '')).toEqual({ ok: false, error: 'getaddrinfo ENOTFOUND api.example.com' })
  })
})

describe('listedModels', () => {
  it('takes the ids, sorted and once each', () => {
    expect(listedModels({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: '' }, {}, null] })).toEqual([{ name: 'a' }, { name: 'b' }])
  })

  it('takes limits from context_window and max_output_tokens when both are given', () => {
    // DeepSeek's answer, trimmed.
    const body = {
      object: 'list',
      data: [
        { id: 'deepseek-flash', object: 'model', context_window: 1048576, max_output_tokens: 393216 },
        { id: 'half', context_window: 32768 },
        { id: 'odd', context_window: '32768', max_output_tokens: 0 },
      ],
    }
    expect(listedModels(body)).toEqual([
      { name: 'deepseek-flash', limits: { context: 1048576, output: 393216 } },
      { name: 'half' },
      { name: 'odd' },
    ])
  })

  it('refuses an answer that is not a model list', () => {
    expect(listedModels({ models: [] })).toBeUndefined()
    expect(listedModels(undefined)).toBeUndefined()
  })
})

describe('anthropicModels', () => {
  it('takes the ids, with limits where the list gives them', () => {
    expect(anthropicModels({ data: [{ id: 'b', max_input_tokens: 200000, max_tokens: 64000 }, { id: 'a' }] })).toEqual([
      { name: 'a' },
      { name: 'b', limits: { context: 200000, output: 64000 } },
    ])
    expect(anthropicModels({ models: [] })).toBeUndefined()
  })
})

describe('geminiModels', () => {
  it('takes the models that generate content, by their request name, with their limits', () => {
    const body = {
      models: [
        { name: 'models/gemini-3-pro', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/text-embedding-004', inputTokenLimit: 2048, outputTokenLimit: 1, supportedGenerationMethods: ['embedContent'] },
      ],
    }
    expect(geminiModels(body)).toEqual([{ name: 'gemini-3-pro', limits: { context: 1048576, output: 65536 } }])
    expect(geminiModels({ data: [] })).toBeUndefined()
  })
})
