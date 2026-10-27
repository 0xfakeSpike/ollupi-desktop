// The conversation flow's three weights (docs/design-guidelines.md §3.1):
// a ProcessRow for each step of the agent's process, a Block for content
// that stands on its own, an ActionCard for what waits on the user.

import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from './cn'

export interface ProcessRowProps {
  /** A 14px icon; it carries the row's colour when the step failed. */
  icon: ReactNode
  /** What was done and to what, on one line. */
  title: ReactNode
  /** After the title, e.g. a property of the call. */
  badge?: ReactNode
  /** Right-aligned: duration, exit code, state. */
  meta?: ReactNode
  /** Shown when the row is open; a row without details does not open. */
  children?: ReactNode
  defaultOpen?: boolean
  /** System information (memory, compaction), quieter than the process. */
  quiet?: boolean
  className?: string
}

/** One line of the agent's process that opens into its details, which hang
 * off a guide line under the icon. */
export function ProcessRow({ icon, title, badge, meta, children, defaultOpen = false, quiet, className }: ProcessRowProps) {
  const [open, setOpen] = useState(defaultOpen)
  const detailsId = useId()
  const expandable = children != null && children !== false
  const line = (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{title}</span>
      {badge}
      <span className="flex-1" />
      {meta && <span className="flex shrink-0 items-center gap-1.5 text-small text-fg-subtle tabular-nums">{meta}</span>}
      {expandable && (
        <ChevronRight
          size={14}
          aria-hidden
          className={cn(
            'shrink-0 text-fg-subtle opacity-0 transition duration-160 ease-standard group-hover/row:opacity-100 group-focus-visible/row:opacity-100',
            open && 'rotate-90 opacity-100',
          )}
        />
      )}
    </>
  )
  const rowClass = cn(
    'group/row flex min-h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left',
    quiet ? 'text-small text-fg-subtle' : 'text-ui text-fg-muted',
  )
  return (
    <div className={className}>
      {/* The row's hover fill reaches past the column so the icon stays on its edge. */}
      <div className="-mx-1.5">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
            className={cn(
              rowClass,
              'transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
            )}
          >
            {line}
          </button>
        ) : (
          <div className={rowClass}>{line}</div>
        )}
      </div>
      {expandable && open && (
        <div id={detailsId} className="my-1 ml-1.5 flex flex-col gap-2 border-l border-line pl-3.5">
          {children}
        </div>
      )}
    </div>
  )
}

export interface BlockProps {
  /** A small heading row, e.g. a code block's language. */
  label?: ReactNode
  /** Controls at the heading row's end, e.g. a copy button. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Content that stands on its own in the flow: code, output, a plan. */
export function Block({ label, actions, children, className }: BlockProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-3', className)}>
      {(label || actions) && (
        <div className="-mt-1 -mr-1.5 flex h-6 items-center gap-2 text-small text-fg-subtle">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

/** accent asks, warning confirms a change, danger crosses a safety line. */
export type ActionTone = 'accent' | 'warning' | 'danger'

const strips: Record<ActionTone, string> = { accent: 'bg-accent', warning: 'bg-warning', danger: 'bg-danger' }
const icons: Record<ActionTone, string> = { accent: 'text-accent', warning: 'text-warning', danger: 'text-danger' }

export interface ActionCardProps {
  tone: ActionTone
  /** A 16px icon, coloured by the tone. */
  icon: ReactNode
  /** The question the user answers, e.g. "Allow this command?". */
  title: ReactNode
  children?: ReactNode
  /** The answers, primary last. */
  actions: ReactNode
  /** Left of the actions, e.g. why the primary one is not yet enabled. */
  status?: ReactNode
  className?: string
}

/** What waits on the user. The only thing in the flow that floats: raised,
 * shadowed, with the tone as a strip down its left edge. */
export function ActionCard({ tone, icon, title, children, actions, status, className }: ActionCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'relative flex animate-enter flex-col gap-3 overflow-hidden rounded-lg border border-line-strong bg-raised p-3 pl-4 shadow-sm motion-reduce:animate-fade',
        className,
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', strips[tone])} />
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 flex shrink-0', icons[tone])}>{icon}</span>
        <h3 id={titleId} className="min-w-0 flex-1 text-ui font-medium text-fg">
          {title}
        </h3>
      </div>
      {children}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status && <span className="mr-auto text-small text-fg-subtle">{status}</span>}
        {actions}
      </div>
    </section>
  )
}
