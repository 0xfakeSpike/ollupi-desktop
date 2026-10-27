// Core's language-neutral values worded in the current language.

import { elapsed, formatTokens, span, toolLabel } from '@ollupi/core'
import type { ItemRow, ThreadRow, Usage } from '@ollupi/protocol'
import type { Messages } from '.'
import type { Locale } from './locale'

export function relativeTime(m: Messages, locale: Locale, iso: string, now = Date.now()): string {
  const e = elapsed(iso, now)
  if (!e) return ''
  switch (e.unit) {
    case 'now':
      return m.common.time.now
    case 'soon':
      return m.common.time.soon
    case 'date':
      return new Date(e.at).toLocaleDateString(locale)
    default:
      return (e.future ? m.common.time.in : m.common.time.ago)[e.unit](e.n)
  }
}

export function duration(m: Messages, startIso: string, endIso: string | null | undefined, now = Date.now()): string {
  const d = span(startIso, endIso, now)
  if (!d) return ''
  if ('ms' in d) return m.common.span.ms(d.ms)
  if ('digits' in d) return m.common.span.s(d.s.toFixed(d.digits))
  return m.common.span.m(d.m, d.s)
}

export function usageLine(m: Messages, u: Usage): string {
  if (u.inputTokens + u.outputTokens === 0) return ''
  const [input, output] = [formatTokens(u.inputTokens), formatTokens(u.outputTokens)]
  return u.cachedInputTokens ? m.common.usage.lineCached(input, formatTokens(u.cachedInputTokens), output) : m.common.usage.line(input, output)
}

/** A one-line label for any tool call. */
export function toolTitle(m: Messages, item: ItemRow): string {
  const l = toolLabel(item)
  switch (l.kind) {
    case 'command':
      return l.line
    case 'plan':
      return m.common.tool.plan
    case 'question':
      return m.common.tool.question
    case 'memorySearch':
      return l.query ? m.common.tool.memorySearchFor(l.query) : m.common.tool.memorySearch
    case 'subagent':
      return l.description
    case 'tool':
      return l.name ?? m.common.tool.unnamed
  }
}

/** The server sets preview to the first line of the first turn's input when
 * that turn starts; before then the thread has no title of its own. */
export function threadTitle(m: Messages, thread: Pick<ThreadRow, 'preview'>): string {
  return thread.preview || m.common.newThread
}
