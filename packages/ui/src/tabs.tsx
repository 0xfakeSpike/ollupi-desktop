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
      className={cn(vertical ? 'flex flex-col gap-0.5' : 'flex gap-4 self-stretch')}
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
              'flex items-center gap-1.5 text-ui transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              // A column reads like the sidebar. A row is text whose underline
              // lies on the line under the tab bar, which its container draws.
              vertical
                ? cn('h-7 w-full rounded-md px-2 text-left', selected ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover')
                : cn(
                    'relative min-h-8 font-medium',
                    selected ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg' : 'text-fg-muted hover:text-fg',
                  ),
            )}
          >
            <span className={cn(vertical && 'min-w-0 flex-1 truncate')} title={vertical ? t.label : undefined}>
              {t.label}
            </span>
            {t.detail && <span className="text-small text-fg-subtle tabular-nums">{t.detail}</span>}
          </button>
        )
      })}
    </div>
  )
}
