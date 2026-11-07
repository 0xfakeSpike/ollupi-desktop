// The conversation's tabs of the app's browser: the pages its agent works
// in, which the person can watch and use; the agent acts in the tab shown.
// The page itself is a view the main process lays over this panel's area, so
// the panel reports where that area is whenever it moves or resizes, and
// hides the view when it closes or something of the panel's lies over it.
// A star keeps the page shown among the person's bookmarks, which open from
// a list beside Chrome's. Typing an address offers the pages visited and
// bookmarked that match it, and completes the best one's address in place.
// A page's download is saved where the person chooses in the save dialog, and
// the panel then says where it went, with a way to show it in Finder.

import { Button, cn, IconButton, Input } from '@ollupi/ui'
import { ArrowLeft, ArrowRight, BookMarked, CircleAlert, Download, Globe, History, Plus, RotateCw, Star, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bookmark, BookmarkList, BrowserDownload, BrowserState, BrowserTab, Suggestions } from '../../../../shared/ipc'
import { addBookmark, openPage, removeBookmark } from '../../domains/browser'
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
  // What the address bar offers for what is typed; the latest asked wins.
  const [offer, setOffer] = useState<Suggestions>()
  const asked = useRef(0)
  const [completing, setCompleting] = useState(false)
  const [pick, setPick] = useState(-1)
  // The last download the page made: where it went, or that it failed.
  const [saved, setSaved] = useState<BrowserDownload>()

  useEffect(() => {
    void desktop.browser.state(thread).then(setState)
    void desktop.browser.bookmarks.list().then((l) => setOwn(l.own))
    const offState = desktop.browser.onState((t, s) => t === thread && setState(s))
    const offDownload = desktop.browser.onDownloaded((t, d) => t === thread && setSaved(d))
    return () => {
      offState()
      offDownload()
    }
  }, [thread])

  // Offered only while an address is being typed. The best page's address
  // completes what is typed, selected so the next key replaces it, unless the
  // last key deleted.
  const offered = address?.trim() ? (offer?.items ?? []) : []
  const inline = offer?.inline
  const completion =
    completing && address && inline && !/\s/.test(address) && inline.text.toLowerCase().startsWith(address.toLowerCase()) ? inline.text.slice(address.length) : ''
  useLayoutEffect(() => {
    if (completion && address) input.current?.setSelectionRange(address.length, address.length + completion.length)
  }, [address, completion])
  const typing = (typed: string, deleted: boolean) => {
    setAddress(typed)
    setPick(-1)
    setCompleting(!deleted)
    const ask = ++asked.current
    void desktop.browser.suggest(typed).then((o) => ask === asked.current && setOffer(o))
  }
  const stopTyping = () => {
    asked.current++
    setAddress(undefined)
    setOffer(undefined)
    setPick(-1)
  }
  // The page takes the keys once it opens, as in a browser.
  const go = (url: string | undefined) => {
    stopTyping()
    if (!url?.trim()) return
    input.current?.blur()
    void openPage(thread, url)
  }

  // Shown only once a page is open; until then the panel says what it is for.
  // Hidden while the panel's edge is dragged, as it would take the pointer,
  // and while the bookmarks list or what the address bar offers is open, as
  // it would cover them.
  const open = !!state?.url
  const resizing = usePanelWidths((s) => s.resizing)
  const covered = listing || offered.length > 0
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !open || resizing || covered) return
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
  }, [open, resizing, covered, thread])

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
          go(pick >= 0 ? offered[pick]?.url : completion ? inline?.url : address)
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
          role="combobox"
          aria-autocomplete="both"
          aria-expanded={offered.length > 0}
          aria-controls={`${thread}-offered`}
          aria-activedescendant={pick >= 0 ? `${thread}-offered-${pick}` : undefined}
          spellCheck={false}
          className="ml-1 flex-1 font-mono text-small"
          placeholder={t.addressPlaceholder}
          value={address === undefined ? (state?.url ?? '') : address + completion}
          onChange={(e) => typing(e.target.value, (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!offered.length) return
              e.preventDefault()
              setPick((p) => (e.key === 'ArrowDown' ? Math.min(p + 1, offered.length - 1) : Math.max(p - 1, -1)))
            } else if (e.key === 'Escape') {
              // First what is offered goes, then what was typed.
              e.preventDefault()
              if (offered.length || completion) {
                setOffer(undefined)
                setCompleting(false)
                setPick(-1)
              } else stopTyping()
            }
          }}
          onFocus={(e) => e.target.select()}
          onBlur={stopTyping}
        />
        <IconButton
          label={kept ? t.unbookmark : t.bookmark}
          size="sm"
          disabled={!open}
          active={kept}
          onClick={async () => {
            if (!state?.url) return
            const next = await (kept ? removeBookmark(state.url) : addBookmark(state.url, state.title))
            if (next) setOwn(next)
          }}
        >
          <Star size={14} fill={kept ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label={t.bookmarks} size="sm" active={listing} data-bookmarks-toggle onClick={() => setListing((l) => !l)}>
          <BookMarked size={14} />
        </IconButton>
        {offered.length > 0 && <Offered id={`${thread}-offered`} items={offered} pick={pick} onPick={setPick} onOpen={go} />}
        {listing && (
          <Bookmarks
            onOpen={(url) => {
              setListing(false)
              void openPage(thread, url)
            }}
            onClose={() => setListing(false)}
            onChanged={setOwn}
          />
        )}
      </form>
      {/* Above the page's view, which covers the area below. */}
      {saved && <DownloadNotice download={saved} onDismiss={() => setSaved(undefined)} />}
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

/** Where a page's download went, or that it did not finish; a saved file can
 * be shown in Finder. It sits above the page's view, which would cover it. */
function DownloadNotice({ download, onDismiss }: { download: BrowserDownload; onDismiss(): void }) {
  const t = useT().conversation.browser
  const { path } = download
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-line bg-raised py-1.5 pr-1 pl-3 text-small">
      {path ? (
        <>
          <Download size={13} className="shrink-0 text-fg-subtle" aria-hidden />
          <span className="selectable min-w-0 flex-1 truncate" title={path}>
            {t.saved(path)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void desktop.revealFile(path)}>
            {t.showInFinder}
          </Button>
        </>
      ) : (
        <>
          <CircleAlert size={13} className="shrink-0 text-danger" aria-hidden />
          <span className="min-w-0 flex-1 truncate" title={download.name}>
            {t.downloadFailed(download.name)}
          </span>
        </>
      )}
      <IconButton label={t.dismissDownload} size="sm" className="-my-0.5 shrink-0" onClick={onDismiss}>
        <X size={12} />
      </IconButton>
    </div>
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
                  const next = await removeBookmark(b.url)
                  if (!next) return
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

/** The pages offered for what is typed in the address bar; the person
 * picks one with the arrow keys or the pointer. Pressing on one keeps the
 * address bar focused until the click opens it. */
function Offered({ id, items, pick, onPick, onOpen }: { id: string; items: Suggestions['items']; pick: number; onPick(i: number): void; onOpen(url: string): void }) {
  const t = useT().conversation.browser
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={t.offered}
      className="absolute top-full right-2 left-2 z-20 mt-1 animate-enter overflow-hidden rounded-lg border border-line bg-raised py-1 shadow-lg motion-reduce:animate-fade"
    >
      {items.map((page, i) => (
        <li
          key={page.url}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === pick}
          title={page.url}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onPick(i)}
          onClick={() => onOpen(page.url)}
          className={cn('flex cursor-default items-center gap-2 px-3 py-1.5 text-small', i === pick && 'bg-hover')}
        >
          {page.bookmarked ? (
            <Star size={13} aria-label={t.bookmarked} className="shrink-0 text-fg-subtle" />
          ) : (
            <History size={13} aria-label={t.visited} className="shrink-0 text-fg-subtle" />
          )}
          {page.title && <span className="max-w-[60%] shrink-0 truncate text-fg">{page.title}</span>}
          <span className="min-w-0 truncate font-mono text-fg-subtle">{written(page.url)}</span>
        </li>
      ))}
    </ul>
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

/** An address as people write it: no scheme, no www., no lone slash. */
function written(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^([^/?#]*)\/$/, '$1')
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
