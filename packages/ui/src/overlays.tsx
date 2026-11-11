import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { IconButton } from './buttons'
import { cn } from './cn'

export interface DialogProps {
  title: string
  /** One sentence under the title on what the dialog is for. */
  description?: ReactNode
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  /** 640px for long forms; 480px otherwise. */
  wide?: boolean
  /** The close button's accessible label, in the app's language. */
  closeLabel: string
}

/** A modal; render it only while open. Escape and the backdrop close it. */
export function Dialog({ title, description, onClose, children, footer, wide, closeLabel }: DialogProps) {
  const body = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const scrolls = useScrolls(body, content)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-scrim p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          'flex max-h-full w-full animate-dialog flex-col rounded-xl border border-line bg-raised shadow-lg motion-reduce:animate-fade',
          wide ? 'max-w-dialog-wide' : 'max-w-dialog',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-fg">{title}</h2>
            {description && <p className="mt-1 text-ui text-fg-muted">{description}</p>}
          </div>
          <IconButton label={closeLabel} size="sm" className="-mt-0.5 -mr-1" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div ref={body} className="overflow-y-auto px-5 py-4">
          <div ref={content}>{children}</div>
        </div>
        {footer && <div className={cn('flex justify-end gap-2 px-5 pb-5', scrolls && 'border-t border-line pt-4')}>{footer}</div>}
      </div>
    </div>
  )
}

/** Whether the viewport scrolls its content, kept current as either resizes. */
function useScrolls(viewport: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const [scrolls, setScrolls] = useState(false)
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el || !content.current) return
    const check = () => setScrolls(el.scrollHeight > el.clientHeight)
    const observer = new ResizeObserver(check)
    observer.observe(el)
    observer.observe(content.current)
    return () => observer.disconnect()
  }, [viewport, content])
  return scrolls
}
