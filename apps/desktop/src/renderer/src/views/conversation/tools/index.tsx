// Tool calls by kind: core reads which kind a call is (callOf), and each
// kind has one view here. The record is keyed by every kind, so a kind
// without a view does not compile; anything else draws through it.

import { callOf, type ToolCall, type ToolKind } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { useMemo } from 'react'
import { command } from './command'
import { file } from './file'
import { plan } from './plan'
import { question } from './question'
import { glob, grep, read } from './read'
import { subagent } from './subagent'
import { tool } from './tool'
import type { ToolView } from './types'

const views: { [K in ToolKind]: ToolView<Extract<ToolCall, { kind: K }>> } = {
  command,
  file,
  read,
  glob,
  grep,
  plan,
  question,
  subagent,
  tool,
}

/** The view of a call's kind. */
export function viewOf<C extends ToolCall>(call: C): ToolView<C> {
  return views[call.kind] as unknown as ToolView<C>
}

export function ToolCallView({ item }: { item: ItemRow }) {
  const call = useMemo(() => callOf(item), [item])
  const { Call } = viewOf(call)
  return <Call item={item} call={call} />
}
