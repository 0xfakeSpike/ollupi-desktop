// The timeline a conversation view draws, for an item that reads others of
// its thread: a subagent's launch finds the report it wrote back.

import type { Timeline } from '@ollupi/core'
import { createContext, useContext } from 'react'

export const CurrentTimeline = createContext<Timeline | undefined>(undefined)

export function useCurrentTimeline(): Timeline | undefined {
  return useContext(CurrentTimeline)
}
