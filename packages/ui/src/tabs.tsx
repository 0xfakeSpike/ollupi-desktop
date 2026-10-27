import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

export interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange(id: T): void
  label: string
}

/** A row of tabs (WAI-ARIA tabs pattern): arrow keys, Home and End move
 * between them. The panel is the caller's, labelled by `tab-<id>`. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const next =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    const id = tabs[next]!.id
    onChange(id)
    refs.current.get(id)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-1" onKeyDown={onKeyDown}>
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
              'h-7 rounded-md px-3 text-[13px] transition focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
              selected ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
