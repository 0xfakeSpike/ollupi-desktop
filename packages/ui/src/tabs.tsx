import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

export interface TabsProps<T extends string> {
  /** detail is shown after the label, e.g. a count. */
  tabs: readonly { id: T; label: string; detail?: string }[]
  value: T
  onChange(id: T): void
  label: string
  /** A row (the default), or a column beside the panel. */
  orientation?: 'horizontal' | 'vertical'
}

/** Tabs (WAI-ARIA tabs pattern): arrow keys along the orientation, Home and
 * End move between them. The panel is the caller's, labelled by `tab-<id>`. */
export function Tabs<T extends string>({ tabs, value, onChange, label, orientation = 'horizontal' }: TabsProps<T>) {
  const vertical = orientation === 'vertical'
  const [back, forward] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const next =
      e.key === forward ? (i + 1) % tabs.length : e.key === back ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    const id = tabs[next]!.id
    onChange(id)
    refs.current.get(id)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={cn('flex gap-1', vertical ? 'flex-col' : 'items-center')}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el)
              else refs.current.delete(t.id)
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex h-7 items-center gap-2 rounded-md px-3 text-[13px] transition focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
              vertical && 'w-full text-left',
              selected ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            <span className={cn(vertical && 'min-w-0 flex-1 truncate')} title={vertical ? t.label : undefined}>
              {t.label}
            </span>
            {t.detail && <span className="text-xs text-fg-subtle tabular-nums">{t.detail}</span>}
          </button>
        )
      })}
    </div>
  )
}
