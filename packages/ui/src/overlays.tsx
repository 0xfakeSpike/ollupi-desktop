import { ChevronRight, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { IconButton, cn } from './primitives'

export interface DialogProps {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Dialog({ open, title, onClose, children, footer, width = 440 }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        style={{ width }}
        className="flex max-h-full flex-col rounded-xl border border-line bg-raised shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export interface DisclosureProps {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  /** Extra content on the summary row, outside the toggle. */
  aside?: ReactNode
}

export function Disclosure({ summary, children, defaultOpen = false, className, aside }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-fg-muted hover:text-fg"
        >
          <ChevronRight size={14} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
          <div className="min-w-0 flex-1">{summary}</div>
        </button>
        {aside}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}
