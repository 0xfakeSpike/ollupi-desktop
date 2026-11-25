// A line that opens into what is behind it (DESIGN.md 1.2: the first layer
// says what matters; process, paths, models and counts open from here). The
// chevron is the one the flow's rows use.

import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from './cn'

export function Details({
  summary,
  className,
  children,
  defaultOpen = false,
  open: given,
  onToggle,
}: {
  summary: ReactNode
  className?: string
  children: ReactNode
  defaultOpen?: boolean
  /** Whether it is open, for a parent that lays out around it; its own when absent. */
  open?: boolean
  onToggle?(open: boolean): void
}) {
  const [own, setOwn] = useState(defaultOpen)
  const open = given ?? own
  const setOpen = (next: boolean) => {
    setOwn(next)
    onToggle?.(next)
  }
  const id = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(
          '-mx-1.5 flex items-center gap-1 rounded-full px-1.5 text-left transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          className,
        )}
      >
        {summary}
        <ChevronRight size={14} aria-hidden className={cn('shrink-0 text-fg-subtle transition duration-160 ease-standard', open && 'rotate-90')} />
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  )
}
