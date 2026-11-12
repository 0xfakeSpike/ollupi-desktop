// Asks to allow one tool call, which the view of its kind words and shows
// (a command its frozen execution, a file edit its frozen diff). A command that asks for full access, lifting this
// computer's limits, is the dangerous tier: it says what that means, its primary action says so too,
// and it can only be allowed once. The card takes the focus when it comes,
// unless the person is typing: on the safe answer when the call is
// dangerous, otherwise on allowing; Esc declines and ↵ allows (DESIGN.md
// 3.2), but never full access, which takes a click. Where an allow rule would let the same
// call run, ollupi suggests one: always allowing saves it, and the card says
// what it adds and where.

import { approvalCallOf } from '@ollupi/core'
import type { Decision, ThreadRow } from '@ollupi/protocol'
import { ActionCard, Button, type ButtonProps } from '@ollupi/ui'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { useTimeline } from '../../domains/conversation'
import type { PendingRequest } from '../../domains/requests'
import { useWorkspace } from '../../domains/workspaces'
import { useT, type Messages } from '../../i18n'
import { viewOf } from '../conversation/tools'

// Decline first, the primary action last.
const order: Decision[] = ['decline', 'acceptForSession', 'acceptAlways', 'accept']

export function ApprovalCard({ request }: { request: Extract<PendingRequest, { kind: 'approval' }> }) {
  const m = useT()
  const p = request.params
  const call = useMemo(() => approvalCallOf(p), [p])
  const { approval } = viewOf(call)
  const exec = p.preparedExecution
  const fullAccess = !!exec?.escalated
  const decisions = order.filter((d) => p.availableDecisions.includes(d) && !(fullAccess && d === 'acceptForSession'))
  const thread = useTimeline(p.threadId)?.thread
  const workspace = useWorkspace(thread?.workspaceId)
  const rules = p.suggestedRules ?? []
  const label = (d: Decision) =>
    d === 'acceptAlways' ? alwaysLabel(m, thread, workspace?.name) : d === 'accept' && fullAccess ? m.requests.approval.allowFullAccess : m.requests.approval.decisions[d]
  const variant = (d: Decision): ButtonProps['variant'] =>
    d === 'accept' ? (fullAccess ? 'danger' : 'primary') : d === 'decline' && !fullAccess ? 'ghost' : 'secondary'
  // The key each answer has: Esc declines, ↵ allows once unless that is full access.
  const key = (d: Decision) => (d === 'decline' ? 'Esc' : d === 'accept' && !fullAccess ? '↵' : undefined)
  const first: Decision | undefined = fullAccess ? 'decline' : decisions.includes('accept') ? 'accept' : decisions[0]
  const focused = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!typing()) focused.current?.focus({ preventScroll: true })
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape' && decisions.includes('decline')) {
      e.preventDefault()
      e.stopPropagation()
      request.respond('decline')
    } else if (e.key === 'Enter' && !fullAccess && decisions.includes('accept') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      request.respond('accept')
    }
  }
  return (
    <div data-pending-request onKeyDown={onKeyDown}>
    <ActionCard
      tone={fullAccess ? 'danger' : 'warning'}
      kicker={m.requests.approval.kicker}
      title={approval.title(m, call, p)}
      actions={decisions.map((d) => (
        <Button key={d} ref={d === first ? focused : undefined} data-default={d === first || undefined} variant={variant(d)} onClick={() => request.respond(d)}>
          {label(d)}
          {key(d) && <kbd className="ml-1.5 font-sans text-caption opacity-60">{key(d)}</kbd>}
        </Button>
      ))}
    >
      {fullAccess && <p className="text-ui text-fg">{m.requests.approval.fullAccessConsequence}</p>}
      {p.reason && <p className="selectable text-ui text-fg-muted">{p.reason}</p>}
      {/* What the call does, in its tool's words (web_fetch's URL), unless its view shows it already (a command, a diff). */}
      {p.content && !approval.showsContent && <p className="selectable text-ui break-all text-fg">{p.content}</p>}
      <approval.Body call={call} params={p} />
      {exec?.justification && <p className="selectable text-ui text-fg-muted">“{exec.justification}”</p>}
      {decisions.includes('acceptAlways') && rules.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-small text-fg-muted">
          <span className="mr-1">{m.requests.approval.alwaysAdds}</span>
          {rules.map((r) => (
            <code key={r} className="selectable rounded-sm bg-hover px-1.5 py-0.5 font-mono text-small">
              {r}
            </code>
          ))}
        </p>
      )}
    </ActionCard>
    </div>
  )
}

/** Whether the person is writing somewhere, which a card arriving must not
 * take them from: a field with the focus and something in it. The message
 * box keeps the focus after sending, empty, and that is no writing. */
export function typing(): boolean {
  const el = document.activeElement
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio')) return el.value.trim() !== ''
  return el instanceof HTMLElement && el.isContentEditable && !!el.textContent?.trim()
}

/** Where ollupi saves the rules (agent.allowAlways): the thread's
 * workspace, which a subagent shares with its parent; without one, the
 * thread's own settings, a subagent's being its parent's. */
function alwaysLabel(m: Messages, thread: ThreadRow | undefined, workspace: string | undefined): string {
  const t = m.requests.approval
  if (workspace) return t.alwaysIn(workspace)
  return thread?.parentThreadId ? t.alwaysInParent : t.alwaysInThread
}
