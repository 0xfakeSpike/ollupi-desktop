// The conversation's tabs of the app's browser: the pages its agent works
// in, which the person can watch and use; the agent acts in the tab shown.
// The page itself is a view the main process lays over this panel's area, so
// the panel reports where that area is whenever it moves or resizes, and
// hides the view when it closes or something of the panel's lies over it.
// A star keeps the page shown among the person's bookmarks, which open from
// a list beside Chrome's.

import { cn, IconButton, Input } from '@ollupi/ui'
import { ArrowLeft, ArrowRight, BookMarked, Globe, Plus, RotateCw, Star, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bookmark, BookmarkList, BrowserState, BrowserTab } from '../../../../shared/ipc'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { CLEAR_OF_EDGE, SidePanel, usePanelWidths } from './SidePanel'

export function BrowserPanel({ thread }: { thread: string }) {
  const t = useT().conversation.browser
  const [state, setState] = useState<BrowserState>()
  const [address, setAddress] = useState<string>()
  const area = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [own, setOwn] = useState<Bookmark[]>([])
  const [listing, setListing] = useState(false)

  useEffect(() => {
    void desktop.browser.state(thread).then(setState)
    void desktop.browser.bookmarks.list().then((l) => setOwn(l.own))
    return desktop.browser.onState((t, s) => t === thread && setState(s))
  }, [thread])

  // Shown only once a page is open; until then the panel says what it is for.
  // Hidden while the panel's edge is dragged, as it would take the pointer,
  // and while the bookmarks list is open, as it would cover it.
  const open = !!state?.url
  const resizing = usePanelWidths((s) => s.resizing)
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !open || resizing || listing) return
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
  }, [open, resizing, listing, thread])

  const kept = !!state?.url && own.some((b) => b.url === state.url)

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
        className="relative flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5"
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
        <IconButton
          label={kept ? t.unbookmark : t.bookmark}
          size="sm"
          disabled={!open}
          active={kept}
          onClick={async () => {
            if (!state?.url) return
            setOwn(kept ? await desktop.browser.bookmarks.remove(state.url) : await desktop.browser.bookmarks.add(state.url, state.title))
          }}
        >
          <Star size={14} fill={kept ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label={t.bookmarks} size="sm" active={listing} data-bookmarks-toggle onClick={() => setListing((l) => !l)}>
          <BookMarked size={14} />
        </IconButton>
        {listing && (
          <Bookmarks
            onOpen={(url) => {
              setListing(false)
              void desktop.browser.open(thread, url)
            }}
            onClose={() => setListing(false)}
            onChanged={setOwn}
          />
        )}
      </form>
      <div ref={area} className={cn('relative min-h-0 flex-1', CLEAR_OF_EDGE)}>
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

/** The person's bookmarks, then each Chrome profile's, under a filter; a
 * click opens one in the tab shown. Chrome's are read when the list opens. */
function Bookmarks({ onOpen, onClose, onChanged }: { onOpen(url: string): void; onClose(): void; onChanged(own: Bookmark[]): void }) {
  const t = useT().conversation.browser
  const [list, setList] = useState<BookmarkList>()
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void desktop.browser.bookmarks.list().then(setList)
  }, [])
  // Closes on a click elsewhere or Escape.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-bookmarks-toggle]')) onClose()
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  const words = filter.trim().toLowerCase()
  const matches = (b: Bookmark & { folder?: string }) => !words || `${b.title} ${b.url} ${b.folder ?? ''}`.toLowerCase().includes(words)
  const own = list?.own.filter(matches) ?? []
  const chrome = (list?.chrome ?? []).map((c) => ({ ...c, bookmarks: c.bookmarks.filter(matches) })).filter((c) => c.bookmarks.length)

  return (
    <div
      ref={box}
      className="absolute top-full right-2 z-20 mt-1 flex max-h-[70vh] w-96 animate-enter flex-col overflow-hidden rounded-lg border border-line bg-raised shadow-lg motion-reduce:animate-fade"
    >
      <div className="border-b border-line p-2">
        <Input autoFocus aria-label={t.filterBookmarks} placeholder={t.filterBookmarks} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="overflow-y-auto py-1">
        {!list ? null : own.length === 0 && chrome.length === 0 ? (
          <p className="px-3 py-4 text-center text-small text-fg-subtle">{words ? t.noBookmarkMatch : t.noBookmarks}</p>
        ) : (
          <>
            {own.length > 0 && <Group label={t.myBookmarks} />}
            {own.map((b) => (
              <Row
                key={b.url}
                bookmark={b}
                onOpen={onOpen}
                onRemove={async () => {
                  const next = await desktop.browser.bookmarks.remove(b.url)
                  onChanged(next)
                  setList((l) => l && { ...l, own: next })
                }}
              />
            ))}
            {chrome.map((c) => (
              <div key={c.profile}>
                <Group label={t.chromeBookmarks(c.profile)} />
                {c.bookmarks.map((b, i) => (
                  <Row key={`${i}:${b.url}`} bookmark={b} folder={b.folder} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function Group({ label }: { label: string }) {
  return <div className="px-3 pt-2 pb-1 text-small font-medium text-fg-subtle">{label}</div>
}

function Row({ bookmark, folder, onOpen, onRemove }: { bookmark: Bookmark; folder?: string; onOpen(url: string): void; onRemove?(): void }) {
  const t = useT().conversation.browser
  return (
    <div className="group flex items-center gap-1 px-1">
      <button
        type="button"
        title={bookmark.url}
        onClick={() => onOpen(bookmark.url)}
        className="flex min-w-0 flex-1 flex-col rounded-md px-2 py-1 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      >
        <span className="truncate text-small text-fg">{bookmark.title}</span>
        <span className="truncate text-small text-fg-subtle">{folder ? `${folder} · ${host(bookmark.url)}` : host(bookmark.url)}</span>
      </button>
      {onRemove && (
        <IconButton label={t.unbookmark} size="sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={onRemove}>
          <X size={12} />
        </IconButton>
      )}
    </div>
  )
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
