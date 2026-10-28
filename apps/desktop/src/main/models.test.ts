import { describe, expect, it } from 'vitest'
import { listedModels, listModels } from './models'

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
    expect(await listModels(fetch, ' https://api.deepseek.com/ ', ' sk-test ')).toEqual({
      ok: true,
      models: [{ name: 'deepseek-flash' }, { name: 'deepseek-pro' }],
    })
    expect(asked[0]!.url).toBe('https://api.deepseek.com/models')
    expect(asked[0]!.init.headers).toEqual({ Authorization: 'Bearer sk-test' })
  })

  it('asks OpenAI for an empty base URL, and sends no key for an API without one', async () => {
    const openai = api(200, '{"data":[]}')
    await listModels(openai.fetch, '', 'sk-test')
    expect(openai.asked[0]!.url).toBe('https://api.openai.com/v1/models')
    const local = api(200, '{"data":[]}')
    await listModels(local.fetch, 'http://127.0.0.1:11434/v1', '')
    expect(local.asked[0]!.init.headers).toEqual({})
  })

  it('says why the API refused', async () => {
    const { fetch } = api(401, JSON.stringify({ error: { message: 'Incorrect API key provided' } }))
    expect(await listModels(fetch, 'https://api.openai.com/v1', 'sk-bad')).toEqual({ ok: false, error: 'HTTP 401: Incorrect API key provided' })
    expect(await listModels(api(404, 'not found').fetch, 'https://example.com', '')).toEqual({ ok: false, error: 'HTTP 404: not found' })
  })

  it('refuses a base URL that is not http(s) without asking', async () => {
    const { fetch, asked } = api(200, '{"data":[]}')
    expect((await listModels(fetch, 'api.deepseek.com', '')).ok).toBe(false)
    expect(asked).toHaveLength(0)
  })

  it('reports a failed request', async () => {
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.example.com')
    }
    expect(await listModels(fetch, 'https://api.example.com', '')).toEqual({ ok: false, error: 'getaddrinfo ENOTFOUND api.example.com' })
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
