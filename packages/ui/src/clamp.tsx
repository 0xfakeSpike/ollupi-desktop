// Text that shows a few lines until opened; long words and paths wrap
// instead of pushing their container wider. The toggle shows only when the
// text is cut.

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from './cn'

export function ClampText({ text, lines = 3, more, less, className }: { text: string; lines?: 2 | 3; more: string; less: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])
  return (
    <div className="flex flex-col items-start gap-1">
      <p ref={ref} className={cn('selectable [overflow-wrap:anywhere] whitespace-pre-wrap', !open && (lines === 2 ? 'line-clamp-2' : 'line-clamp-3'), className)}>
        {text}
      </p>
      {(cut || open) && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-full text-small text-fg-subtle transition-colors duration-100 ease-standard hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          {open ? less : more}
        </button>
      )}
    </div>
  )
}
