// The models a provider's API lists, asked again as its base URL and key are
// typed, so choosing models does not mean copying their names by hand.

import { errorMessage } from '@ollupi/client'
import { useEffect, useState } from 'react'
import type { ApiType, ListedModel } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

export type ModelListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'listed'; models: ListedModel[] }
  | { status: 'failed'; error: string }

/** Waits for typing to pause before asking. */
const PAUSE_MS = 600

/** The API's model list for its type, base URL and key. With both empty
 * there is nothing to ask: an empty base URL is the API's own, which needs
 * a key. retry asks again. */
export function useModelList(type: ApiType, baseUrl: string, apiKey: string): { list: ModelListState; retry(): void } {
  const [list, setList] = useState<ModelListState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const url = baseUrl.trim()
  const key = apiKey.trim()

  useEffect(() => {
    if (!url && !key) {
      setList({ status: 'idle' })
      return
    }
    let current = true
    const timer = setTimeout(() => {
      setList({ status: 'loading' })
      desktop
        .listModels(type, url, key)
        .then((r) => current && setList(r.ok ? { status: 'listed', models: r.models } : { status: 'failed', error: r.error }))
        .catch((err: unknown) => current && setList({ status: 'failed', error: errorMessage(err) }))
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [type, url, key, attempt])

  return { list, retry: () => setAttempt((n) => n + 1) }
}
