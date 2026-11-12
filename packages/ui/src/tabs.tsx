import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

export interface TabsProps<T extends string> {
  /** detail is shown after the label, e.g. a count. */
  tabs: readonly { id: T; label: string; detail?: string }[]
  value: T
  onChange(id: T): void
  label: string
  /** A row (the default), a column beside the panel, or `auto`: a column
   * when the `@container/page` around it is at least 48rem wide, a row
   * above the panel when it is narrower (the window at its smallest). */
  orientation?: 'horizontal' | 'vertical' | 'auto'
}

/** Tabs (WAI-ARIA tabs pattern): arrow keys along the orientation, Home and
 * End move between them. The panel is the caller's, labelled by `tab-<id>`. */
export function Tabs<T extends string>({ tabs, value, onChange, label, orientation = 'horizontal' }: TabsProps<T>) {
  const vertical = orientation === 'vertical'
  const auto = orientation === 'auto'
  // auto takes both axes, as it is either one by the width.
  const back = (k: string) => (auto ? k === 'ArrowUp' || k === 'ArrowLeft' : k === (vertical ? 'ArrowUp' : 'ArrowLeft'))
  const forward = (k: string) => (auto ? k === 'ArrowDown' || k === 'ArrowRight' : k === (vertical ? 'ArrowDown' : 'ArrowRight'))
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const next =
      forward(e.key) ? (i + 1) % tabs.length : back(e.key) ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
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
      aria-orientation={auto ? undefined : orientation}
      className={cn(vertical ? 'flex flex-col gap-0.5' : auto ? 'flex gap-1 @3xl/page:flex-col @3xl/page:gap-0.5' : 'flex gap-1 self-stretch')}
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
              'flex items-center gap-1.5 rounded-full text-ui transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              // Capsules, a column or a row: the chosen one sits on stone.
              selected ? 'bg-surface font-semibold text-fg' : 'font-medium text-fg-muted hover:bg-hover hover:text-fg',
              vertical ? 'h-9 w-full px-3.5 text-left' : auto ? 'h-8 shrink-0 px-3.5 whitespace-nowrap @3xl/page:h-9 @3xl/page:w-full @3xl/page:text-left' : 'h-8 px-3.5',
            )}
          >
            <span className={cn(vertical && 'min-w-0 flex-1 truncate', auto && '@3xl/page:min-w-0 @3xl/page:flex-1 @3xl/page:truncate')} title={vertical || auto ? t.label : undefined}>
              {t.label}
            </span>
            {t.detail && <span className="text-small text-fg-subtle tabular-nums">{t.detail}</span>}
          </button>
        )
      })}
    </div>
  )
}
