// What a provider's account has left to spend, for the providers whose API
// tells an ordinary API key, known by the host of their base URL. Any other
// provider, a missing key or a failed request gives none: the balance is
// shown when it can be had, and never in the way. Asked from the main
// process, as the model list is.

import type { Balance } from '../shared/ipc'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

interface Source {
  url(origin: string): string
  /** The balance in the answer; undefined when it holds none. */
  read(body: unknown, host: string): Balance | undefined
}

const sources: { hosts: string[]; source: Source }[] = [
  // {"balance_infos": [{"currency": "CNY", "total_balance": "110.00", …}]}
  {
    hosts: ['api.deepseek.com'],
    source: {
      url: (origin) => `${origin}/user/balance`,
      read: (body) => {
        const infos = (body as { balance_infos?: unknown } | undefined)?.balance_infos
        if (!Array.isArray(infos)) return undefined
        return amounts(infos.map((i: { currency?: unknown; total_balance?: unknown }) => [i?.currency, i?.total_balance]))
      },
    },
  },
  // {"data": {"available_balance": 49.6, …}}: dollars on .ai, yuan on .cn.
  {
    hosts: ['api.moonshot.ai', 'api.moonshot.cn'],
    source: {
      url: (origin) => `${origin}/v1/users/me/balance`,
      read: (body, host) => amounts([[host.endsWith('.cn') ? 'CNY' : 'USD', (body as { data?: { available_balance?: unknown } })?.data?.available_balance]]),
    },
  },
  // {"data": {"totalBalance": "88.88", …}}: gift and paid balance together;
  // yuan on .cn, dollars on .com.
  {
    hosts: ['api.siliconflow.cn', 'api.siliconflow.com'],
    source: {
      url: (origin) => `${origin}/v1/user/info`,
      read: (body, host) => amounts([[host.endsWith('.cn') ? 'CNY' : 'USD', (body as { data?: { totalBalance?: unknown } })?.data?.totalBalance]]),
    },
  },
  // {"data": {"total_credits": 100.5, "total_usage": 25.75}} in dollars.
  // Only a management key may ask, so an ordinary key usually gets none.
  {
    hosts: ['openrouter.ai'],
    source: {
      url: (origin) => `${origin}/api/v1/credits`,
      read: (body) => {
        const data = (body as { data?: { total_credits?: unknown; total_usage?: unknown } } | undefined)?.data
        const [total, used] = [num(data?.total_credits), num(data?.total_usage)]
        return total === undefined || used === undefined ? undefined : { amounts: [{ currency: 'USD', amount: total - used }] }
      },
    },
  },
]

/** fetch is Electron's, so the request goes through the system's proxy. */
export async function providerBalance(fetch: Fetch, baseUrl: string, apiKey: string): Promise<Balance | undefined> {
  const key = apiKey.trim()
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    return undefined
  }
  const host = url.hostname.toLowerCase()
  const source = sources.find((s) => s.hosts.includes(host))?.source
  if (!key || !source) return undefined
  try {
    const res = await fetch(source.url(url.origin), { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return undefined
    return source.read(JSON.parse(await res.text()), host)
  } catch {
    return undefined
  }
}

/** [currency, amount] pairs, amounts as numbers or numeric strings. */
function amounts(pairs: [unknown, unknown][]): Balance | undefined {
  const out = pairs.flatMap(([currency, amount]) => {
    const n = num(amount)
    return typeof currency === 'string' && currency && n !== undefined ? [{ currency, amount: n }] : []
  })
  return out.length ? { amounts: out } : undefined
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
