import { describe, expect, it } from 'vitest'
import { providerBalance } from './balance'

/** A fetch that answers body to one URL and records what was asked. */
function answering(url: string, body: unknown, status = 200) {
  const asked: { url: string; auth: string | undefined }[] = []
  const fetch = async (u: string, init: RequestInit) => {
    asked.push({ url: u, auth: (init.headers as Record<string, string>).Authorization })
    return new Response(u === url ? JSON.stringify(body) : '{}', { status: u === url ? status : 404 })
  }
  return { fetch, asked }
}

describe('providerBalance', () => {
  it("reads DeepSeek's balance in each currency, from any of its base URLs", async () => {
    const { fetch, asked } = answering('https://api.deepseek.com/user/balance', {
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
    })
    expect(await providerBalance(fetch, 'https://api.deepseek.com/anthropic', 'sk-1')).toEqual({ amounts: [{ currency: 'CNY', amount: 110 }] })
    expect(asked).toEqual([{ url: 'https://api.deepseek.com/user/balance', auth: 'Bearer sk-1' }])
  })

  it("reads Moonshot's and SiliconFlow's in the currency of their region", async () => {
    const moonshot = answering('https://api.moonshot.cn/v1/users/me/balance', { code: 0, data: { available_balance: 49.58, voucher_balance: 46.58, cash_balance: 3 } })
    expect(await providerBalance(moonshot.fetch, 'https://api.moonshot.cn/v1', 'k')).toEqual({ amounts: [{ currency: 'CNY', amount: 49.58 }] })
    const silicon = answering('https://api.siliconflow.com/v1/user/info', { code: 20000, data: { balance: '0.88', chargeBalance: '88.00', totalBalance: '88.88' } })
    expect(await providerBalance(silicon.fetch, 'https://api.siliconflow.com/v1', 'k')).toEqual({ amounts: [{ currency: 'USD', amount: 88.88 }] })
  })

  it("gives OpenRouter's credits less what was used", async () => {
    const { fetch } = answering('https://openrouter.ai/api/v1/credits', { data: { total_credits: 100.5, total_usage: 25.75 } })
    expect(await providerBalance(fetch, 'https://openrouter.ai/api/v1', 'k')).toEqual({ amounts: [{ currency: 'USD', amount: 74.75 }] })
  })

  it('gives none without a key, for another provider, or when the API refuses or says nothing usable', async () => {
    const deepseek = answering('https://api.deepseek.com/user/balance', { balance_infos: [{ currency: 'CNY', total_balance: '1' }] })
    expect(await providerBalance(deepseek.fetch, 'https://api.deepseek.com', ' ')).toBeUndefined()
    expect(await providerBalance(deepseek.fetch, 'https://api.openai.com/v1', 'k')).toBeUndefined()
    expect(await providerBalance(deepseek.fetch, '', 'k')).toBeUndefined()
    expect(deepseek.asked).toEqual([])
    const refused = answering('https://openrouter.ai/api/v1/credits', { error: { message: 'Only management keys can perform this operation' } }, 403)
    expect(await providerBalance(refused.fetch, 'https://openrouter.ai/api/v1', 'k')).toBeUndefined()
    const empty = answering('https://api.deepseek.com/user/balance', { balance_infos: [] })
    expect(await providerBalance(empty.fetch, 'https://api.deepseek.com', 'k')).toBeUndefined()
    const broken = async () => {
      throw new Error('offline')
    }
    expect(await providerBalance(broken, 'https://api.deepseek.com', 'k')).toBeUndefined()
  })
})
