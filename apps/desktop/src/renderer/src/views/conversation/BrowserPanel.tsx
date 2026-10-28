// The app's browser beside the conversation: the page the agent works in,
// which the person can watch and use. The page itself is a view the main
// process lays over this panel's area, so the panel reports where that area
// is whenever it moves or resizes, and hides the view when it closes.

import { cn, IconButton, Input } from '@ollupi/ui'
import { ArrowLeft, ArrowRight, Globe, RotateCw } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserState } from '../../../../shared/ipc'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { SidePanel } from './SidePanel'

export function BrowserPanel() {
  const t = useT().conversation.browser
  const [state, setState] = useState<BrowserState>()
  const [address, setAddress] = useState<string>()
  const area = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void desktop.browser.state().then(setState)
    return desktop.browser.onState(setState)
  }, [])

  // Shown only once a page is open; until then the panel says what it is for.
  const open = !!state?.url
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !open) return
    const place = () => {
      const r = el.getBoundingClientRect()
      void desktop.browser.place({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      void desktop.browser.place(undefined)
    }
  }, [open])

  return (
    <SidePanel panel="browser" width="half" bare title={state?.title || t.title} closeLabel={t.close}>
      <form
        className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (address?.trim()) void desktop.browser.open(address)
          setAddress(undefined)
        }}
      >
        <IconButton label={t.back} size="sm" disabled={!state?.canGoBack} onClick={() => void desktop.browser.back()}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton label={t.forward} size="sm" disabled={!state?.canGoForward} onClick={() => void desktop.browser.forward()}>
          <ArrowRight size={14} />
        </IconButton>
        <IconButton label={t.reload} size="sm" disabled={!open} onClick={() => void desktop.browser.reload()}>
          <RotateCw size={14} className={cn(state?.loading && 'animate-spin')} />
        </IconButton>
        {/* Shows where the page is, unless the person is typing another address. */}
        <Input
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
          </div>
        )}
      </div>
    </SidePanel>
  )
}
