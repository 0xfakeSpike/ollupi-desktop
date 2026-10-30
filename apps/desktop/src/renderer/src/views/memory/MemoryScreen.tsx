// Long-term memory by scope: global, general (conversations outside any
// workspace) and each workspace. Entries can be corrected (ollupi then
// keeps extraction from rewriting them), moved between their own scope and
// global, or forgotten.

import type { MemoryFailure, MemoryRow, MemorySkip, MemoryStatus } from '@ollupi/protocol'
import { Badge, Button, cn, EmptyState, IconButton, Spinner, Tabs, Textarea } from '@ollupi/ui'
import { ArrowRightLeft, Brain, ChevronRight, Pencil, RotateCw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { openThread } from '../../domains/conversation'
import { editMemory, forgetMemory, moveMemory, placeKey, placeOf, readMemory, type MemoryPlace, type MemoryScopes } from '../../domains/memory'
import { shownResult, useSearch } from '../../domains/search'
import { useThreadSummary } from '../../domains/threads'
import { useWorkspaces } from '../../domains/workspaces'
import { useConnection } from '../../gateway/connection'
import { useLocale, useT, type Messages } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'
import { useFound } from '../common/found'
import { MemorySettings } from './MemorySettings'

/** The places a memory can be in, as the list names them. */
function placesOf(m: Messages, workspaces: { id: string; name: string }[]): { place: MemoryPlace; label: string }[] {
  return [
    { place: { scope: 'global' }, label: m.memory.screen.global },
    { place: { scope: 'general' }, label: m.memory.screen.general },
    ...workspaces.map((w) => ({ place: { scope: 'workspace' as const, workspaceId: w.id }, label: w.name })),
  ]
}

/** A kind's display name; a kind this app does not know is shown as sent. */
function kindLabel(m: Messages, kind: string): string {
  const kinds: Record<string, string | undefined> = m.memory.entry.kinds
  return Object.hasOwn(kinds, kind) ? kinds[kind]! : kind
}

export function MemoryScreen({ found }: { found?: { id: string; scope: string } }) {
  const m = useT()
  const workspaces = useWorkspaces((s) => s.list)
  const [scope, setScope] = useState(found?.scope ?? 'global')
  const [data, setData] = useState<{ status: MemoryStatus; scopes: MemoryScopes }>()
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(0)
  // A workspace's search also finds global memories; the list keeps this tab's.
  const matches = shownResult(useSearch(query, scope === 'global' || scope === 'general' ? '' : scope, searched))?.memories?.filter(
    (e) => placeKey(placeOf(e)) === scope,
  )
  const searching = !!query.trim()
  const [loading, setLoading] = useState(true)
  const workspaceIds = workspaces.map((w) => w.id).join('\n')

  // Saving the memory settings restarts the backend: read again once the
  // new one is connected.
  const connected = useConnection((s) => s.gateway === 'connected')
  const reload = useCallback(async () => {
    setLoading(true)
    setData(await readMemory(workspaceIds ? workspaceIds.split('\n') : []))
    setLoading(false)
  }, [workspaceIds])
  useEffect(() => {
    if (connected) void reload()
  }, [reload, connected])

  const update = (change: (rows: MemoryRow[]) => MemoryRow[]) =>
    setData((d) => d && { ...d, scopes: new Map([...d.scopes].map(([k, rows]) => [k, change(rows)])) })
  const replace = (row: MemoryRow) => {
    update((rows) => rows.map((e) => (e.id === row.id ? row : e)))
    setSearched((n) => n + 1)
  }
  const remove = (id: string) => {
    update((rows) => rows.filter((e) => e.id !== id))
    setSearched((n) => n + 1)
  }
  const moved = (row: MemoryRow) => {
    setSearched((n) => n + 1)
    setData((d) => {
      if (!d) return d
      const to = placeKey(placeOf(row))
      return { ...d, scopes: new Map([...d.scopes].map(([k, rows]) => [k, [...rows.filter((e) => e.id !== row.id), ...(k === to ? [row] : [])]])) }
    })
  }
  const places = placesOf(m, workspaces)
  const placeLabel = (key: string) => places.find((p) => placeKey(p.place) === key)?.label ?? key

  // memory/list returns every status; only active memories are used.
  const activeIn = (key: string) => data?.scopes.get(key)?.filter((e) => e.status === 'active') ?? []
  const active = searching ? (matches ?? []) : activeIn(scope)
  const scopes = places.map((p) => ({ id: placeKey(p.place), label: p.label, detail: data && String(activeIn(placeKey(p.place)).length) }))
  useFound(found?.id, !!data)
  const elsewhere = [...(data?.scopes.keys() ?? [])].some((k) => k !== scope && activeIn(k).length > 0)

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-line pr-2 pl-4">
        <h1 className="text-ui font-semibold">{m.memory.screen.title}</h1>
        <div className="flex-1" />
        <IconButton label={m.common.reload} onClick={() => void reload()}>
          <RotateCw size={16} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Its labels start under the header's title. */}
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-line p-2">
          <Tabs label={m.memory.screen.scope} orientation="vertical" tabs={scopes} value={scope} onChange={setScope} />
        </nav>
        <div role="tabpanel" id={`panel-${scope}`} aria-labelledby={`tab-${scope}`} className="scroll-centered flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-6">
            <MemorySettings status={data?.status} />
            {data && <StatusLine status={data.status} />}
            <label className="flex h-8 items-center gap-2 rounded-md border border-line-strong px-2.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-focus">
              <Search size={14} className="shrink-0 text-fg-subtle" />
              <input
                value={query}
                aria-label={m.memory.screen.search}
                placeholder={m.memory.screen.search}
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
              />
            </label>
            {searching && matches?.length === 0 ? (
              <p className="text-small text-fg-subtle">{m.memory.screen.noMatch}</p>
            ) : loading && !data ? (
              <div className="flex justify-center py-12 text-fg-subtle">
                <Spinner />
              </div>
            ) : active.length === 0 ? (
              elsewhere ? (
                <EmptyState icon={<Brain size={20} />} title={m.memory.screen.emptyHere}>
                  {m.memory.screen.emptyHereHint}
                </EmptyState>
              ) : (
                <EmptyState icon={<Brain size={20} />} title={m.memory.screen.emptyYet}>
                  {m.memory.screen.emptyYetHint}
                </EmptyState>
              )
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {active.map((e) => (
                  <Entry
                    key={e.id}
                    entry={e}
                    origin={e.scope === 'global' ? placeLabel(e.originWorkspaceId || 'general') : undefined}
                    onSaved={replace}
                    onMoved={moved}
                    onForgotten={() => remove(e.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusLine({ status }: { status: MemoryStatus }) {
  const m = useT()
  return (
    <div className="flex flex-col gap-1.5 text-small text-fg-muted">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{status.useEnabled ? m.memory.status.used : m.memory.status.notUsed}</Badge>
        <Badge>{status.generationEnabled ? m.memory.status.learningOn : m.memory.status.learningOff}</Badge>
        <span>{m.memory.status.active(status.active)}</span>
        {status.generationEnabled && status.pending > 0 && <span>· {m.memory.status.pending(status.pending)}</span>}
      </div>
      {status.lastError && (
        <FailureLine failure={status.lastError} learning={status.generationEnabled} attempts={status.attempts ?? 0} nextAttempt={status.nextAttempt} />
      )}
      {status.failed > 0 && <SkipLine skipped={status.failed} skip={status.lastSkip} />}
    </div>
  )
}

/** A status line that opens into its details, with the chevron the flow's
 * rows use. */
function Disclosure({ summary, className, children }: { summary: ReactNode; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(
          'group/line -mx-1 flex items-center gap-1 rounded-md px-1 text-left transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
          className,
        )}
      >
        {summary}
        <ChevronRight size={14} aria-hidden className={cn('shrink-0 text-fg-subtle transition duration-160 ease-standard', open && 'rotate-90')} />
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  )
}

/** ollupi's own message, opened under the line that words it. */
function Original({ text }: { text: string }) {
  return <pre className="selectable mt-1 max-h-40 overflow-auto rounded-lg bg-surface p-2 font-mono text-small whitespace-pre-wrap text-fg-muted">{text}</pre>
}

/** The failure ollupi is waiting to retry. A failure before any batch was
 * read leaves no retry time: ollupi tries again on its next poll. While
 * learning is off ollupi does not learn, so nothing retries until it is on. */
function FailureLine({
  failure,
  learning,
  attempts,
  nextAttempt,
}: {
  failure: MemoryFailure
  learning: boolean
  attempts: number
  nextAttempt?: string | null
}) {
  const s = useT().memory.status
  const locale = useLocale((l) => l.locale)
  const reason = s.failure[failure.code]
  const at = nextAttempt && attempts > 0 && Date.parse(nextAttempt) > Date.now() ? nextAttempt : undefined
  const line = !learning
    ? s.retryWhenOn(reason)
    : at
      ? s.retryAt(reason, new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }), attempts)
      : s.retrySoon(reason)
  return (
    <Disclosure summary={line} className="text-danger">
      <Original text={failure.error} />
    </Disclosure>
  )
}

/** Entries given up after repeated failures; skipped counts all of them,
 * skip is the last such batch (absent for skips older than ollupi's record). */
function SkipLine({ skipped, skip }: { skipped: number; skip?: MemorySkip | null }) {
  const m = useT()
  const s = m.memory.status
  const locale = useLocale((l) => l.locale)
  const thread = useThreadSummary(skip?.threadId)
  if (!skip) return <p>{s.skipped(skipped)}</p>
  return (
    <Disclosure summary={s.skipped(skipped)}>
      <div className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3 text-fg-subtle">
        <span title={new Date(skip.at).toLocaleString(locale)}>{s.lastSkip(relativeTime(m, locale, skip.at), skip.entries)}</span>
        <span>
          {s.skipIn}{' '}
          <button type="button" className="text-fg-muted hover:text-fg hover:underline" onClick={() => void openThread(skip.threadId)}>
            {thread ? threadTitle(m, thread) : s.someConversation}
          </button>
        </span>
        <span>{s.skipReason(s.failure[skip.code])}</span>
        <Original text={skip.error} />
      </div>
    </Disclosure>
  )
}

function Entry({
  entry,
  origin,
  onSaved,
  onMoved,
  onForgotten,
}: {
  entry: MemoryRow
  /** For a global memory, the name of the scope it came from. */
  origin: string | undefined
  onSaved(row: MemoryRow): void
  onMoved(row: MemoryRow): void
  onForgotten(): void
}) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.text)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const row = await editMemory(entry.id, text)
    setBusy(false)
    if (row) {
      onSaved(row)
      setEditing(false)
    }
  }

  return (
    <li data-found-id={entry.id} className="group flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2 text-small">
        <span className="font-medium text-fg">{entry.topic}</span>
        <Badge>{kindLabel(m, entry.kind)}</Badge>
        {entry.userEdited && <Badge tone="success">{m.memory.entry.editedByYou}</Badge>}
        {origin !== undefined && <span className="text-fg-subtle">{m.memory.entry.from(origin)}</span>}
        <span className="text-fg-subtle">{relativeTime(m, locale, entry.updatedAt)}</span>
        <div className="flex-1" />
        {!editing && (
          <div className="flex opacity-0 transition group-hover:opacity-100">
            <IconButton label={m.common.edit} size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </IconButton>
            <IconButton
              label={origin === undefined ? m.memory.entry.toGlobal : m.memory.entry.backTo(origin)}
              hint={
                origin === undefined
                  ? m.memory.entry.toGlobalHint
                  : entry.originWorkspaceId
                    ? m.memory.entry.backToWorkspaceHint(origin)
                    : m.memory.entry.backToGeneralHint
              }
              size="sm"
              onClick={() => void moveMemory(entry.id).then((row) => row && onMoved(row))}
            >
              <ArrowRightLeft size={14} />
            </IconButton>
            <IconButton
              label={m.memory.entry.forget}
              size="sm"
              onClick={() => {
                if (confirm(m.memory.entry.forgetConfirm)) void forgetMemory(entry.id).then((ok) => ok && onForgotten())
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {m.common.cancel}
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
              {m.common.save}
            </Button>
          </div>
        </div>
      ) : (
        <p className="selectable text-ui leading-6 whitespace-pre-wrap text-fg-muted">{entry.text}</p>
      )}
    </li>
  )
}
