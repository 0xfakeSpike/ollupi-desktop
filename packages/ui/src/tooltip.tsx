import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

// The wait before a tooltip shows, and how soon after one hides the next
// shows at once: moving along a row of buttons reads each without waiting.
const delay = 500
const warm = 300
let lastHidden = 0

// The gap to the trigger, and the room kept from the window's edges.
const gap = 6
const margin = 8

export interface TooltipProps {
  /** The action, as the trigger's accessible name already says it. */
  label: string
  /** A line under the label on what the action does. */
  hint?: string
}

/** A tooltip for an icon-only control: shown on hover after a moment, or
 * at once on keyboard focus, below the trigger (above when there is no
 * room) and kept inside the window. Spread `trigger` on the control and
 * render `tooltip` anywhere. The label repeats the control's name, so only
 * the hint is announced as its description. */
export function useTooltip({ label, hint }: TooltipProps): {
  trigger: {
    ref(el: HTMLElement | null): void
    onPointerEnter(): void
    onPointerLeave(): void
    onPointerDown(): void
    onFocus(e: FocusEvent<HTMLElement>): void
    onBlur(): void
    'aria-describedby'?: string
  }
  tooltip: ReactNode
} {
  const id = useId()
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [open, setOpen] = useState(false)

  const show = useCallback((now: boolean) => {
    clearTimeout(timer.current)
    if (now || Date.now() - lastHidden < warm) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), delay)
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setOpen((was) => {
      if (was) lastHidden = Date.now()
      return false
    })
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  // Stable, so React calls it only when the trigger mounts or goes away; a
  // trigger that goes away takes its tooltip with it.
  const ref = useCallback(
    (el: HTMLElement | null) => {
      anchor.current = el
      if (!el) hide()
    },
    [hide],
  )

  // It belongs to where the trigger was: a scroll or Escape takes it away.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', hide, true)
    }
  }, [open, hide])

  return {
    trigger: {
      ref,
      onPointerEnter: () => show(false),
      onPointerLeave: hide,
      onPointerDown: hide,
      onFocus: (e) => e.currentTarget.matches(':focus-visible') && show(true),
      onBlur: hide,
      'aria-describedby': hint ? id : undefined,
    },
    tooltip: (
      <>
        {/* The description is in the page whether or not it shows. */}
        {hint && (
          <span id={id} hidden>
            {hint}
          </span>
        )}
        {open && anchor.current && <Bubble anchor={anchor.current} label={label} hint={hint} />}
      </>
    ),
  }
}

function Bubble({ anchor, label, hint }: { anchor: HTMLElement; label: string; hint?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number }>()
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect()
    const { width, height } = el.current!.getBoundingClientRect()
    const below = a.bottom + gap
    const top = below + height + margin <= window.innerHeight ? below : a.top - gap - height
    const left = Math.min(Math.max(a.left + a.width / 2 - width / 2, margin), window.innerWidth - margin - width)
    setAt({ top, left })
  }, [anchor, label, hint])
  return createPortal(
    <div
      ref={el}
      role="tooltip"
      style={at ?? { top: 0, left: 0, visibility: 'hidden' }}
      className={cn(
        'pointer-events-none fixed z-50 flex w-max max-w-72 animate-fade flex-col gap-0.5 rounded-md bg-ink text-small text-ink-fg shadow-md',
        hint ? 'px-2.5 py-1.5' : 'px-2 py-1',
      )}
    >
      <span className={hint ? 'font-medium' : undefined}>{label}</span>
      {hint && <span className="text-pretty text-ink-fg/70">{hint}</span>}
    </div>,
    document.body,
  )
}
