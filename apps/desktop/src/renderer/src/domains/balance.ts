// What a provider's account has left, shown beside it in the models
// settings. It is asked when shown, at most once in a while for the same
// base URL and key, or again on request; a provider whose API does not tell
// its key has none.

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const asked = useRef(0)

  const ask = useCallback(
    (force: boolean) => {
      const mine = ++asked.current
      const known = answers.get(id)
      if (!force && known && Date.now() - known.at < FRESH_MS) {
        setBalance(known.balance)
        setLoading(false)
        return
      }
      setLoading(true)
      void desktop
        .balance(url, key)
        .catch(() => undefined)
        .then((b) => {
          answers.set(id, { balance: b, at: Date.now() })
          if (mine !== asked.current) return
          setBalance(b)
          setLoading(false)
        })
    },
    [id, url, key],
  )

  useEffect(() => {
    if (key) return ask(false)
    asked.current++
    setBalance(undefined)
    setLoading(false)
  }, [ask, key])
  return { balance, loading, refresh: () => void ask(true) }
}
