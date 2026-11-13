// The frame of a panel beside a conversation: a column at the window's
// right, the full height of the screen, set off by a line rather than laid
// over the conversation. Its title row lines up with the conversation's
// header and moves the window like it; under it a body that scrolls on its
// own. It is a region of its own (@ollupi/ui region.ts): its menus and
// tooltips open inside it. Its left edge drags to resize it;
// each panel keeps the width it was given, and a double click on the edge
// gives back its own.

import { cn, IconButton } from '@ollupi/ui'
import { X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { togglePanel, type Panel } from '../../domains/navigation'
import { useT } from '../../i18n'

const KEY = 'ollupi.panelWidths'
/** The narrowest a panel goes, and the room it leaves the conversation. */
const MIN_WIDTH = 260
const CONVERSATION_ROOM = 360
/** How far an arrow key moves the edge. */
const STEP = 24
/** For content the main process lays over the panel, such as the browser's
 * page: it would cover the edge and take its pointer, so it starts past it. */
export const CLEAR_OF_EDGE = 'ml-1.5'

function stored(): Partial<Record<Panel, number>> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(saved).filter(([, w]) => typeof w === 'number' && w >= MIN_WIDTH)) as Partial<Record<Panel, number>>
  } catch {
    // An unreadable width is none: panels take their own.
    return {}
  }
}

/** The widths people gave panels, and whether an edge is being dragged:
 * the browser hides its page meanwhile, as the page would take the pointer. */
export const usePanelWidths = create<{ widths: Partial<Record<Panel, number>>; resizing: boolean }>()(() => ({ widths: stored(), resizing: false }))

function setWidth(panel: Panel, width: number | undefined): void {
  usePanelWidths.setState((s) => {
    const widths = { ...s.widths }
    if (width === undefined) delete widths[panel]
    else widths[panel] = Math.round(width)
    return { widths }
  })
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(usePanelWidths.getState().widths))
  } catch {
    // Not kept: the panel keeps its width until the app closes.
  }
}

export function SidePanel({
  panel,
  title,
  closeLabel,
  actions,
  width = 'normal',
  bare,
  chrome,
  children,
}: {
  panel: Panel
  title: string
  closeLabel: string
  /** Controls under the title row that belong with it, such as the
   * browser's tabs and address bar: one region with the title row, so their
   * menus and tooltips stay out of the body below it, where the browser's
   * page is drawn above the interface. */
  chrome?: ReactNode
  /** Buttons beside the close button. */
  actions?: ReactNode
  /** The width it starts at: wide for content read at length, such as a
   * file; half for a web page. */
  width?: 'normal' | 'wide' | 'half'
  /** The body without padding or its own scrolling, for content that lays
   * itself out. */
  bare?: boolean
  children: ReactNode
}) {
  const given = usePanelWidths((s) => s.widths[panel])
  const aside = useRef<HTMLElement>(null)
  const t = useT().conversation.screen

  // A panel closed mid-drag, as when the screen changes, ends its drag:
  // otherwise the cursor it set stays on every screen.
  const stopDrag = useRef<() => void>(undefined)
  useEffect(() => () => stopDrag.current?.(), [])

  /** A width within what the conversation beside it leaves. */
  const fit = (w: number) => {
    const room = aside.current?.parentElement?.getBoundingClientRect().width ?? Infinity
    return Math.max(MIN_WIDTH, Math.min(w, room - CONVERSATION_ROOM))
  }

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const el = aside.current
    if (!el || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    const startX = e.clientX
    const startWidth = el.getBoundingClientRect().width
    handle.setPointerCapture(e.pointerId)
    usePanelWidths.setState({ resizing: true })
    document.body.style.cursor = 'col-resize'
    // A button let go where the window does not see it, over a region that
    // moves the window, ends the drag at the next move.
    const move = (ev: globalThis.PointerEvent) => {
      if (!(ev.buttons & 1)) end()
      else setWidth(panel, fit(startWidth + startX - ev.clientX))
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('lostpointercapture', end)
      stopDrag.current = undefined
      document.body.style.cursor = ''
      usePanelWidths.setState({ resizing: false })
      save()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', end)
    stopDrag.current = end
  }

  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0
    if (!by || !aside.current) return
    e.preventDefault()
    setWidth(panel, fit(aside.current.getBoundingClientRect().width + by))
    save()
  }

  return (
    <aside
      ref={aside}
      data-region
      style={given ? { width: given } : undefined}
      className={cn(
        'relative flex max-w-[calc(100%-22.5rem)] min-w-65 shrink-0 flex-col overflow-hidden border-l border-line bg-canvas',
        // Beside the conversation it would squeeze it under 360px: on a narrow
        // screen it lies over the conversation instead, as a sheet.
        '@max-3xl/screen:absolute @max-3xl/screen:inset-y-0 @max-3xl/screen:right-0 @max-3xl/screen:z-20 @max-3xl/screen:max-w-[calc(100%-3rem)] @max-3xl/screen:rounded-l-3xl @max-3xl/screen:border-l-0 @max-3xl/screen:shadow-lg',
        !given && (width === 'half' ? 'w-1/2' : width === 'wide' ? 'w-112' : 'w-80'),
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t.resizePanel}
        tabIndex={0}
        onPointerDown={drag}
        onKeyDown={nudge}
        onDoubleClick={() => {
          setWidth(panel, undefined)
          save()
        }}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize [-webkit-app-region:no-drag] transition-colors duration-100 ease-standard hover:bg-line-strong focus-visible:bg-ink focus-visible:outline-none"
      />
      <div data-region={chrome ? '' : undefined} className="flex shrink-0 flex-col">
        <div className="drag flex h-16 shrink-0 items-center gap-1 pr-4 pl-5">
          <h2 className="flex-1 truncate text-ui font-semibold">{title}</h2>
          {actions}
          <IconButton label={closeLabel} size="sm" onClick={() => togglePanel(panel)}>
            <X size={14} />
          </IconButton>
        </div>
        {chrome}
      </div>
      {bare ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>}
    </aside>
  )
}
