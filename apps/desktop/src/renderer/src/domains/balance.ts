// What a provider's account has left, shown beside it in the models
// settings. It is asked when shown, at most once in a while for the same
// base URL and key, or again on request; a provider whose API does not tell
// its key has none.

import { useCallback, useEffect, useState } from 'react'
import type { Balance } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

/** How long an answer stands before showing it asks again. */
const FRESH_MS = 5 * 60_000

const answers = new Map<string, { balance: Balance | undefined; at: number }>()

/** The balance, whether it is being asked, and a way to ask again now. */
export function useBalance(baseUrl: string, apiKey: string): { balance: Balance | undefined; loading: boolean; refresh(): void } {
  const url = baseUrl.trim()
  const key = apiKey.trim()
  const id = `${url}\n${key}`
  const [balance, setBalance] = useState(answers.get(id)?.balance)
  const [loading, setLoading] = useState(false)

  const ask = useCallback(
    (force: boolean) => {
      const known = answers.get(id)
      if (!force && known && Date.now() - known.at < FRESH_MS) {
        setBalance(known.balance)
        return () => {}
      }
      let current = true
      setLoading(true)
      void desktop
        .balance(url, key)
        .catch(() => undefined)
        .then((b) => {
          answers.set(id, { balance: b, at: Date.now() })
          if (!current) return
          setBalance(b)
          setLoading(false)
        })
      return () => {
        current = false
      }
    },
    [id, url, key],
  )

  useEffect(() => (key ? ask(false) : setBalance(undefined)), [ask, key])
  return { balance, loading, refresh: () => void ask(true) }
}
