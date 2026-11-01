// The conversation's tabs of the app's browser: the pages its agent works
// in, which the person can watch and use; the agent acts in the tab shown.
// The page itself is a view the main process lays over this panel's area, so
// the panel reports where that area is whenever it moves or resizes, and
// hides the view when it closes.

import { cn, IconButton, Input } from '@ollupi/ui'
import { ArrowLeft, ArrowRight, Globe, Plus, RotateCw, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserState, BrowserTab } from '../../../../shared/ipc'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { SidePanel, usePanelWidths } from './SidePanel'

export function BrowserPanel({ thread }: { thread: string }) {
  const t = useT().conversation.browser
  const [state, setState] = useState<BrowserState>()
  const [address, setAddress] = useState<string>()
  const area = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void desktop.browser.state(thread).then(setState)
    return desktop.browser.onState((t, s) => t === thread && setState(s))
  }, [thread])

  // Shown only once a page is open; until then the panel says what it is for.
  // Hidden while the panel's edge is dragged, as it would take the pointer.
  const open = !!state?.url
  const resizing = usePanelWidths((s) => s.resizing)
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !open || resizing) return
    const place = () => {
      const r = el.getBoundingClientRect()
      void desktop.browser.place(thread, { x: r.left, y: r.top, width: r.width, height: r.height })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      void desktop.browser.place(thread, undefined)
    }
  }, [open, resizing, thread])

  return (
    <SidePanel panel="browser" width="half" bare title={state?.title || t.title} closeLabel={t.close}>
      <div role="tablist" aria-label={t.tabs} className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1">
        {state?.tabs.map((tab) => (
          <Tab key={tab.id} tab={tab} active={tab.id === state.active} thread={thread} />
        ))}
        <IconButton
          label={t.newTab}
          size="sm"
          onClick={async () => {
            await desktop.browser.newTab(thread)
            input.current?.focus()
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      <form
        className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (address?.trim()) void desktop.browser.open(thread, address)
          setAddress(undefined)
        }}
      >
        <IconButton label={t.back} size="sm" disabled={!state?.canGoBack} onClick={() => void desktop.browser.back(thread)}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton label={t.forward} size="sm" disabled={!state?.canGoForward} onClick={() => void desktop.browser.forward(thread)}>
          <ArrowRight size={14} />
        </IconButton>
        <IconButton label={t.reload} size="sm" disabled={!open} onClick={() => void desktop.browser.reload(thread)}>
          <RotateCw size={14} className={cn(state?.loading && 'animate-spin')} />
        </IconButton>
        {/* Shows where the page is, unless the person is typing another address. */}
        <Input
          ref={input}
          aria-label={t.address}
          spellCheck={false}
          className="ml-1 flex-1 font-mono text-small"
          placeholder={t.addressPlaceholder}
          value={address ?? state?.url ?? ''}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => setAddress(undefined)}
        />
      </form>
      <div ref={area} className="relative min-h-0 flex-1">
        {!open && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <Globe size={20} className="text-fg-subtle" />
            <p className="max-w-sm text-small text-fg-subtle">{t.empty}</p>
            {(state?.tabs.length ?? 0) > 1 && <p className="max-w-sm text-small text-fg-subtle">{t.agentActsHere}</p>}
          </div>
        )}
      </div>
    </SidePanel>
  )
}

/** A tab: its title, which shows it, and a button that closes it. */
function Tab({ tab, active, thread }: { tab: BrowserTab; active: boolean; thread: string }) {
  const t = useT().conversation.browser
  const title = tab.title || tab.url || t.untitled
  return (
    <div
      className={cn(
        'group flex h-7 max-w-44 min-w-24 shrink-0 items-center gap-1 rounded-md pr-0.5 pl-2.5 text-small transition-colors duration-100 ease-standard',
        active ? 'bg-hover text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={tab.url || title}
        className="min-w-0 flex-1 truncate text-left outline-none"
        onClick={() => void desktop.browser.selectTab(thread, tab.id)}
      >
        {title}
      </button>
      <IconButton
        label={t.closeTab(title)}
        size="sm"
        className={cn('size-5 shrink-0', !active && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        onClick={() => void desktop.browser.closeTab(thread, tab.id)}
      >
        <X size={12} />
      </IconButton>
    </div>
  )
}
