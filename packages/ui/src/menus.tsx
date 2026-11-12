// A choice that opens from its trigger (DESIGN.md 3.7, menu / select
// popover): a list of options, grouped when they come from several
// sources, with a description under an option that needs one, a filter
// box for a long list, and actions below a separator. It opens above the
// trigger when there is more room there (a message box sits at the bottom
// of the window), and is driven by keys as well as the pointer: ↑ ↓ move,
// ↵ picks, Esc closes back to the trigger.

import { Check, Search } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export interface PickerOption<V extends string> {
  value: V
  label: ReactNode
  /** A line under the label, on what choosing it means. */
  description?: ReactNode
  /** The heading it is listed under; options keep their order within one. */
  group?: string
  /** What the filter matches; the value when absent. */
  search?: string
  /** Shown at the row's end, e.g. "default". */
  note?: ReactNode
}

export interface PickerAction {
  label: ReactNode
  icon?: ReactNode
  onSelect(): void
}

export interface PickerProps<V extends string> {
  /** The list's accessible name, and the trigger's. */
  label: string
  value: V | undefined
  options: PickerOption<V>[]
  onChange(value: V): void
  /** The trigger's content; the trigger itself is drawn by className. */
  children: ReactNode
  className?: string
  /** A filter box above the list, with what it says when nothing matches. */
  filter?: { placeholder: string; empty: string }
  /** Below the options, after a separator. */
  actions?: PickerAction[]
  /** Widest the list gets; it is at least as wide as the trigger. */
  width?: number
}

const margin = 8
const gap = 6

type Row<V extends string> = { kind: 'option'; option: PickerOption<V> } | { kind: 'action'; action: PickerAction }

export function Picker<V extends string>({ label, value, options, onChange, children, className, filter, actions = [], width = 320 }: PickerProps<V>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number; minWidth: number }>()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => (o.search ?? o.value).toLowerCase().includes(q)) : options
  }, [options, query])
  const rows: Row<V>[] = useMemo(
    () => [...shown.map((option) => ({ kind: 'option' as const, option })), ...actions.map((action) => ({ kind: 'action' as const, action }))],
    [shown, actions],
  )

  const close = (refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) trigger.current?.focus()
  }
  const pick = (row: Row<V> | undefined) => {
    if (!row) return
    close(true)
    if (row.kind === 'option') onChange(row.option.value)
    else row.action.onSelect()
  }

  // Placed against the trigger: above it when there is more room above.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const above = r.top - margin - gap
    const below = window.innerHeight - r.bottom - margin - gap
    const up = above > below
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - margin - width))
    setPlace(
      up
        ? { left, bottom: window.innerHeight - r.top + gap, maxHeight: Math.min(420, above), minWidth: r.width }
        : { left, top: r.bottom + gap, maxHeight: Math.min(420, below), minWidth: r.width },
    )
  }, [open, width])

  // Opening starts on the chosen option.
  useEffect(() => {
    if (!open) return
    const at = shown.findIndex((o) => o.value === value)
    setActive(at < 0 ? 0 : at)
    // Only when it opens: typing a filter moves to the first match instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (open && query) setActive(0)
  }, [open, query])
  useEffect(() => {
    list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // A press anywhere else closes it, as does the window losing focus.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close(false)
    }
    const onBlur = () => close(false)
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
    } else if (e.key === 'Home' || e.key === 'End') {
      if (e.target instanceof HTMLInputElement) return
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : rows.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(rows[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  // Headings go before the first option of each group.
  let lastGroup: string | undefined
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={className}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {children}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            data-overlay
            onKeyDown={onKeyDown}
            style={{ left: place.left, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, minWidth: place.minWidth, maxWidth: width }}
            className="fixed z-50 flex animate-enter flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-md motion-reduce:animate-fade"
          >
            {filter && (
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-3">
                <Search size={14} className="shrink-0 text-fg-subtle" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={filter.placeholder}
                  aria-label={filter.placeholder}
                  aria-controls={id}
                  aria-activedescendant={rows[active] ? `${id}-${active}` : undefined}
                  className="h-9 min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
            )}
            <div
              ref={(el) => {
                list.current = el
                if (el && !filter) el.focus({ preventScroll: true })
              }}
              id={id}
              role="listbox"
              aria-label={label}
              tabIndex={filter ? -1 : 0}
              aria-activedescendant={!filter && rows[active] ? `${id}-${active}` : undefined}
              className="min-h-0 overflow-y-auto p-1 outline-none"
            >
              {shown.length === 0 && filter && <div className="px-2 py-1.5 text-ui text-fg-subtle">{filter.empty}</div>}
              {rows.map((row, i) => {
                if (row.kind === 'action') {
                  return (
                    <div key={`a${i}`}>
                      {i === shown.length && <div role="separator" className="my-1 h-px bg-line" />}
                      <div
                        id={`${id}-${i}`}
                        data-row={i}
                        role="option"
                        aria-selected={false}
                        onPointerMove={() => setActive(i)}
                        onClick={() => pick(row)}
                        className={cn('flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 text-ui text-fg-muted', i === active && 'bg-hover text-fg')}
                      >
                        {row.action.icon}
                        {row.action.label}
                      </div>
                    </div>
                  )
                }
                const o = row.option
                const heading = o.group !== undefined && o.group !== lastGroup ? o.group : undefined
                lastGroup = o.group
                const selected = o.value === value
                return (
                  <div key={o.value}>
                    {heading !== undefined && <div className="px-2 pt-2 pb-1 text-small font-medium text-fg-subtle first:pt-1">{heading}</div>}
                    <div
                      id={`${id}-${i}`}
                      data-row={i}
                      role="option"
                      aria-selected={selected}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick(row)}
                      className={cn(
                        'flex min-h-7 cursor-default items-start gap-2 rounded-md px-2 py-1 text-ui text-fg',
                        i === active && 'bg-hover',
                        selected && 'bg-selected font-medium',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{o.label}</span>
                        {o.description && <span className="text-small font-normal text-fg-muted">{o.description}</span>}
                      </span>
                      {o.note && <span className="shrink-0 pt-px text-small font-normal text-fg-subtle">{o.note}</span>}
                      <Check size={14} className={cn('mt-1 shrink-0', selected ? 'text-fg' : 'invisible')} aria-hidden />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
