// Whether the cards asking the person something (an approval, a question)
// have all scrolled out of the conversation's view, and a way back to the
// first one: the pill above the message box says so (DESIGN.md 3.2). The
// cards mark themselves with data-pending-request.

import { useEffect, useState, type RefObject } from 'react'
import { useThreadRequests } from '../../domains/requests'
import { typing } from '../requests/ApprovalCard'

/** How much of a tall card counts as seen when less than a quarter shows. */
const SEEN_PX = 120

export function useWaitingOutOfView(scroller: RefObject<HTMLElement | null>, threadId: string): { count: number; hidden: boolean; reveal(): void } {
  const count = useThreadRequests(threadId).length
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const root = scroller.current
    setHidden(false)
    if (!root || count === 0) return
    const shown = new Map<Element, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        // An edge peeking in is not a card one can read and answer.
        for (const e of entries) shown.set(e.target, e.isIntersecting && (e.intersectionRatio >= 0.25 || e.intersectionRect.height >= SEEN_PX))
        setHidden(shown.size > 0 && ![...shown.values()].some(Boolean))
      },
      { root, threshold: [0, 0.1, 0.25, 0.5, 1] },
    )
    // A card can render after the request arrives (a process opening).
    const watch = () => {
      for (const el of root.querySelectorAll('[data-pending-request]')) {
        if (!shown.has(el)) {
          shown.set(el, true)
          io.observe(el)
        }
      }
    }
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [scroller, count])

  const reveal = () => {
    const card = scroller.current?.querySelector<HTMLElement>('[data-pending-request]')
    if (!card) return
    card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    // The card's own first answer (an approval marks it), not a copy button in its body.
    const answer = card.querySelector<HTMLElement>('[data-default]') ?? card.querySelector<HTMLElement>('[role="radio"], [role="checkbox"], input')
    if (!typing()) answer?.focus({ preventScroll: true })
  }
  return { count, hidden, reveal }
}
