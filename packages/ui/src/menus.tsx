// A choice that opens from its trigger (DESIGN.md 3.7, menu / select
// popover): a list of options, grouped when they come from several
// sources, with a description under an option that needs one, a filter
// box for a long list, and actions below a separator. It opens above the
// trigger when there is more room there (a message box sits at the bottom
// of the window), within the region its trigger is in (region.ts), and is
// driven by keys as well as the pointer: ↑ ↓ move, ↵ picks, Esc closes back
// to the trigger.

import { Check, Search } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { regionOf } from './region'

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
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number; minWidth: number; maxWidth: number }>()
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
  // The options cut where the heading changes, so a heading pins over the rows
  // of its own group while they scroll under it.
  const sections = useMemo(() => {
    const out: { group: string | undefined; options: { option: PickerOption<V>; at: number }[] }[] = []
    shown.forEach((option, at) => {
      const last = out[out.length - 1]
      if (last && last.group === option.group) last.options.push({ option, at })
      else out.push({ group: option.group, options: [{ option, at }] })
    })
    return out
  }, [shown])

  const close = (refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) trigger.current?.focus()
  }
  // Back to the trigger after a key, so the keyboard keeps its place; after
  // a click the focus is let go, so no focus ring lingers on the trigger.
  const pick = (row: Row<V> | undefined, byKey: boolean) => {
    if (!row) return
    close(byKey)
    if (row.kind === 'option') onChange(row.option.value)
    else row.action.onSelect()
  }

  // Placed against the trigger, inside the trigger's region: above it when
  // there is more room above, and moved left as far as its width needs.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const region = regionOf(trigger.current)
    const above = r.top - region.top - margin - gap
    const below = region.bottom - r.bottom - margin - gap
    const up = above > below
    const maxWidth = Math.min(width, region.right - region.left - 2 * margin)
    const left = Math.max(region.left + margin, Math.min(r.left, region.right - margin - maxWidth))
    const minWidth = Math.min(r.width, maxWidth)
    setPlace(
      up
        ? { left, bottom: window.innerHeight - r.top + gap, maxHeight: Math.min(420, above), minWidth, maxWidth }
        : { left, top: r.bottom + gap, maxHeight: Math.min(420, below), minWidth, maxWidth },
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
      pick(rows[active], true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

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
            style={{ left: place.left, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, minWidth: place.minWidth, maxWidth: place.maxWidth }}
            className="fixed z-50 flex animate-enter flex-col overflow-hidden rounded-2xl bg-raised shadow-md dark:ring-1 dark:ring-line motion-reduce:animate-fade"
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
                  className="h-9 min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-muted"
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
              {shown.length === 0 && filter && <div className="px-2.5 py-1.5 text-ui text-fg-subtle">{filter.empty}</div>}
              {sections.map((section, si) => (
                <div key={`s${si}`} role={section.group === undefined ? undefined : 'group'} aria-label={section.group}>
                  {/* The heading spans the panel's full width so rows pass
                      behind it, and its text lines up with theirs. */}
                  {section.group !== undefined && (
                    <div aria-hidden className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-raised px-3.5 pt-2.5 pb-1">
                      <span className="shrink-0 text-small font-semibold text-fg-muted">{section.group}</span>
                      <span className="shrink-0 rounded-full bg-hover px-1.5 text-caption tabular-nums text-fg-subtle">{section.options.length}</span>
                      <span className="ml-0.5 h-px flex-1 bg-line" />
                    </div>
                  )}
                  {section.options.map(({ option: o, at }) => {
                    const selected = o.value === value
                    return (
                      <div
                        key={o.value}
                        id={`${id}-${at}`}
                        data-row={at}
                        role="option"
                        aria-selected={selected}
                        onPointerMove={() => setActive(at)}
                        onClick={() => pick({ kind: 'option', option: o }, false)}
                        className={cn(
                          'flex min-h-8 cursor-default items-start gap-2 rounded-xl px-2.5 py-1.5 text-ui text-fg',
                          at === active && 'bg-hover',
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
                    )
                  })}
                </div>
              ))}
              {actions.map((action, ai) => {
                const i = shown.length + ai
                return (
                  <div key={`a${ai}`}>
                    {ai === 0 && <div role="separator" className="my-1 h-px bg-line" />}
                    <div
                      id={`${id}-${i}`}
                      data-row={i}
                      role="option"
                      aria-selected={false}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick({ kind: 'action', action }, false)}
                      className={cn('flex min-h-8 cursor-default items-center gap-2 rounded-xl px-2.5 text-ui text-fg-muted', i === active && 'bg-hover text-fg')}
                    >
                      {action.icon}
                      {action.label}
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

// A small set of places to go, laid out as tiles in columns so every one is
// near its trigger (DESIGN.md 3.7, the header's More): each tile is an icon
// and a name on one line with a line in small type under it; the one that
// is on is moss. Actions sit below a separator. It opens when the pointer
// rests on the trigger and closes when it leaves both, or on a click, which
// keeps it open until a press elsewhere; ↓ or ↵ on the trigger opens it with
// the keys, arrows move across the grid, Esc closes back to the trigger. It
// lines up with the trigger's right edge, within the trigger's region.

export interface TileMenuTile<V extends string> {
  value: V
  icon: ReactNode
  label: ReactNode
  description?: ReactNode
}

export interface TileMenuProps<V extends string> {
  /** The menu's accessible name, and the trigger's. */
  label: string
  tiles: TileMenuTile<V>[]
  /** The tile that is on. */
  value: V | undefined
  onPick(value: V): void
  /** Below the tiles, after a separator. */
  actions?: PickerAction[]
  children: ReactNode
  className?: string
  /** Widest the menu gets. */
  width?: number
}

const columns = 2
// Long enough to pass from the trigger to the menu, short enough that a
// pointer passing by does not open it.
const openDelay = 90
const closeDelay = 260
const stagger = 25

export function TileMenu<V extends string>({ label, tiles, value, onPick, actions = [], children, className, width = 352 }: TileMenuProps<V>) {
  const [open, setOpen] = useState<false | 'hover' | 'click'>(false)
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; width: number }>()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const focusFirst = useRef(false)

  // The grid's cells: the tiles in rows of two, then the actions in a row
  // of their own.
  const tileRows = Math.ceil(tiles.length / columns)
  const cells = [
    ...tiles.map((t, i) => ({ key: `t${t.value}`, row: Math.floor(i / columns), col: i % columns })),
    ...actions.map((_, i) => ({ key: `a${i}`, row: tileRows + Math.floor(i / columns), col: i % columns })),
  ]

  const wait = (then: () => void, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(then, ms)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const close = (refocus: boolean) => {
    clearTimeout(timer.current)
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const pick = (then: () => void, byKey: boolean) => {
    close(byKey)
    then()
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const region = regionOf(trigger.current)
    const w = Math.min(width, region.right - region.left - 2 * margin)
    const left = Math.max(region.left + margin, Math.min(r.right - w, region.right - margin - w))
    const up = r.top - region.top > region.bottom - r.bottom
    setPlace(up ? { left, bottom: window.innerHeight - r.top + gap, width: w } : { left, top: r.bottom + gap, width: w })
  }, [open, width])

  useEffect(() => {
    if (!open || !place || !focusFirst.current) return
    focusFirst.current = false
    panel.current?.querySelector<HTMLElement>('[data-cell]')?.focus()
  }, [open, place])

  // A press elsewhere, Esc, the window losing focus or resizing closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close(panel.current?.contains(document.activeElement) ?? false)
    }
    const onBlur = () => close(false)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onBlur)
    }
  }, [open])

  // Resting on the trigger opens it; leaving the trigger and the menu
  // closes what the pointer opened, not what a click did.
  const hoverIn = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (open) clearTimeout(timer.current)
    else wait(() => setOpen((o) => o || 'hover'), openDelay)
  }
  const hoverOut = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (open === 'click') return
    wait(() => setOpen((o) => (o === 'click' ? o : false)), closeDelay)
  }

  const move = (e: KeyboardEvent, at: number) => {
    const { row, col } = cells[at]!
    const to = (r: number, c: number) => {
      const inRow = cells.filter((x) => x.row === r)
      return inRow.length ? cells.indexOf(inRow[Math.min(c, inRow.length - 1)]!) : -1
    }
    const next =
      e.key === 'ArrowRight' ? (cells[at + 1]?.row === row ? at + 1 : -1)
      : e.key === 'ArrowLeft' ? (col > 0 ? at - 1 : -1)
      : e.key === 'ArrowDown' ? to(row + 1, col)
      : e.key === 'ArrowUp' ? to(row - 1, col)
      : -2
    if (next === -2) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && next < 0) trigger.current?.focus()
    else if (next >= 0) panel.current?.querySelectorAll<HTMLElement>('[data-cell]')[next]?.focus()
  }

  // Each cell fades in after the ones nearer the trigger, whose corner is
  // the menu's top right.
  const delay = (at: number) => {
    const { row, col } = cells[at]!
    return { animationDelay: `${(row + (columns - 1 - col)) * stagger}ms`, animationFillMode: 'backwards' }
  }
  const cellBase = 'animate-fade motion-reduce:animate-none focus-visible:outline-none'

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-label={label}
        className={className}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        onClick={() => {
          clearTimeout(timer.current)
          if (open === 'click') close(false)
          else setOpen('click')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            focusFirst.current = true
            setOpen('click')
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
            role="menu"
            aria-label={label}
            onPointerEnter={hoverIn}
            onPointerLeave={hoverOut}
            style={{ left: place.left, top: place.top, bottom: place.bottom, width: place.width }}
            className="fixed z-50 animate-enter rounded-2xl bg-raised p-1 shadow-md dark:ring-1 dark:ring-line motion-reduce:animate-fade"
          >
            <div className="grid grid-cols-2 gap-0.5">
              {tiles.map((t, i) => {
                const on = t.value === value
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    data-cell
                    style={delay(i)}
                    onKeyDown={(e) => move(e, i)}
                    onClick={(e) => pick(() => onPick(t.value), e.detail === 0)}
                    className={cn(
                      cellBase,
                      'flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ease-standard',
                      on ? 'bg-ink text-ink-fg' : 'text-fg hover:bg-hover focus-visible:bg-hover',
                    )}
                  >
                    <span className="flex items-center gap-2 text-ui font-semibold">
                      <span className={cn('flex shrink-0', on ? 'text-ink-fg' : 'text-fg-muted')}>{t.icon}</span>
                      <span className="min-w-0 truncate">{t.label}</span>
                      {on && <Check size={14} className="ml-auto shrink-0" aria-hidden />}
                    </span>
                    {t.description && <span className={cn('text-small', on ? 'text-ink-fg/80' : 'text-fg-muted')}>{t.description}</span>}
                  </button>
                )
              })}
            </div>
            {actions.length > 0 && (
              <>
                {tiles.length > 0 && <div role="separator" className="mx-2 my-1 h-px bg-line" />}
                <div className="grid grid-cols-2 gap-0.5">
                  {actions.map((a, i) => {
                    const at = tiles.length + i
                    return (
                      <button
                        key={i}
                        type="button"
                        role="menuitem"
                        data-cell
                        style={delay(at)}
                        onKeyDown={(e) => move(e, at)}
                        onClick={(e) => pick(a.onSelect, e.detail === 0)}
                        className={cn(
                          cellBase,
                          'flex min-h-8 min-w-0 items-center gap-2 rounded-xl px-3 text-left text-ui text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg',
                        )}
                      >
                        <span className="flex shrink-0">{a.icon}</span>
                        <span className="min-w-0 truncate">{a.label}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
