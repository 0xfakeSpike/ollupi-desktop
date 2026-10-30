// One search over what the person has: conversations by title, their
// messages, scheduled tasks and memories, which ollupi answers grouped by
// kind (search). The search screen keeps its query and scope while the
// person opens a result and comes back.

import type { SearchResult } from '@ollupi/protocol'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

/** Each group's most. */
const LIMIT = 20
/** Waits for typing to pause before asking. */
const PAUSE_MS = 250

/** The search screen's query and scope; an empty workspaceId is every
 * workspace and none. */
export const useSearchScreen = create<{ query: string; workspaceId: string }>()(() => ({ query: '', workspaceId: '' }))

export type SearchState = { status: 'idle' } | { status: 'searching'; last: SearchResult | undefined } | { status: 'found'; result: SearchResult }

/** ollupi's answer for the query as typed, once typing pauses; idle while
 * the query has no words. The previous answer stays while the next is
 * asked, so the list does not flash empty. A new version asks again, after
 * what was found changed. */
export function useSearch(query: string, workspaceId: string, version = 0): SearchState {
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const q = query.trim()
  useEffect(() => {
    if (!q) {
      setState({ status: 'idle' })
      return
    }
    let current = true
    setState((s) => ({ status: 'searching', last: s.status === 'found' ? s.result : s.status === 'searching' ? s.last : undefined }))
    const timer = setTimeout(() => {
      void run(
        (e) => e.search,
        () => gateway().call('search', { query: q, workspaceId: workspaceId || undefined, limit: LIMIT }),
      ).then((result) => current && setState(result ? { status: 'found', result } : { status: 'idle' }))
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [q, workspaceId, version])
  return state
}

/** The answer to show: the current one, or the last while the next is asked. */
export function shownResult(state: SearchState): SearchResult | undefined {
  return state.status === 'found' ? state.result : state.status === 'searching' ? state.last : undefined
}

/** The query's words, for marking them in what was found; ollupi matches
 * every word, ignoring case. */
export function queryTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}
