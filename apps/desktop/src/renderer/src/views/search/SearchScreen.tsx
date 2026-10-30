// Search: one query, and what ollupi found grouped by kind. A conversation
// opens; a message opens its conversation at it; a task or a memory opens
// the screen that lists it.

import type { CronJobView, MemoryRow, MessageHit, ThreadRow } from '@ollupi/protocol'
import { Badge, cn, EmptyState, Select, Spinner } from '@ollupi/ui'
import { Bot, Brain, CalendarClock, MessageSquare, Search, User } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { openThread, openThreadAt } from '../../domains/conversation'
import { go } from '../../domains/navigation'
import { queryTerms, shownResult, useSearch, useSearchScreen } from '../../domains/search'
import { activeWorkspaces, useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT, type Messages } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'
import { Highlight } from './Highlight'

export function SearchScreen() {
  const m = useT()
  const t = m.search
  const { query, workspaceId } = useSearchScreen()
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list))
  const state = useSearch(query, workspaceId)
  const result = shownResult(state)
  const terms = queryTerms(query)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.select(), [])

  const total = result ? (result.threads?.length ?? 0) + (result.messages?.length ?? 0) + (result.tasks?.length ?? 0) + (result.memories?.length ?? 0) : 0

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-line pr-2 pl-4">
        <h1 className="text-ui font-semibold">{t.title}</h1>
      </header>
      <div className="scroll-centered flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
          <div className="flex items-center gap-2">
            <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line-strong px-3 focus-within:border-accent focus-within:ring-3 focus-within:ring-focus">
              <Search size={16} className="shrink-0 text-fg-subtle" />
              <input
                ref={input}
                autoFocus
                value={query}
                aria-label={t.title}
                placeholder={t.placeholder}
                spellCheck={false}
                onChange={(e) => useSearchScreen.setState({ query: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
              />
              {state.status === 'searching' && <Spinner size={14} className="shrink-0 text-fg-subtle" />}
            </label>
            <Select aria-label={t.scope} className="h-9 max-w-48" value={workspaceId} onChange={(e) => useSearchScreen.setState({ workspaceId: e.target.value })}>
              <option value="">{t.everywhere}</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>

          {!terms.length ? (
            <p className="text-small text-fg-subtle">{t.hint}</p>
          ) : result && total === 0 && state.status === 'found' ? (
            <EmptyState icon={<Search size={20} />} title={t.none(query.trim())} />
          ) : (
            result && (
              <>
                <Group title={t.groups.threads} items={result.threads}>
                  {(x) => <ThreadResult key={x.id} thread={x} terms={terms} />}
                </Group>
                <Group title={t.groups.messages} items={result.messages}>
                  {(x) => <MessageResult key={x.itemId} hit={x} terms={terms} />}
                </Group>
                <Group title={t.groups.tasks} items={result.tasks}>
                  {(x) => <TaskResult key={x.id} job={x} terms={terms} />}
                </Group>
                <Group title={t.groups.memories} items={result.memories}>
                  {(x) => <MemoryResult key={x.id} memory={x} terms={terms} />}
                </Group>
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function Group<T>({ title, items, children }: { title: string; items: T[] | null; children(item: T): ReactNode }) {
  if (!items?.length) return null
  return (
    <section className="flex flex-col gap-1">
      <h2 className="flex h-7 items-center gap-2 text-small font-medium text-fg-subtle">
        {title}
        <span className="tabular-nums">{items.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">{items.map(children)}</ul>
    </section>
  )
}

function Row({ icon, onOpen, children }: { icon: ReactNode; onOpen(): void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-100 ease-standard first:rounded-t-lg last:rounded-b-lg hover:bg-hover',
          'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        )}
      >
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-fg-subtle">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      </button>
    </li>
  )
}

function Meta({ children }: { children: ReactNode[] }) {
  return (
    <span className="flex flex-wrap gap-x-1.5 text-small text-fg-subtle">
      {children.filter(Boolean).flatMap((c, i) => (i === 0 ? [c] : [<span key={`dot${i}`}>·</span>, c]))}
    </span>
  )
}

function useWorkspaceName(): (id: string | undefined) => string {
  const workspaces = useWorkspaces((s) => s.list)
  const t = useT().search
  return (id) => (id ? (workspaces.find((w) => w.id === id)?.name ?? t.noWorkspace) : t.noWorkspace)
}

function ThreadResult({ thread, terms }: { thread: ThreadRow; terms: string[] }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const workspace = useWorkspaceName()
  return (
    <Row icon={<MessageSquare size={14} />} onOpen={() => void openThread(thread.id)}>
      <span className="flex items-center gap-2 text-ui text-fg">
        <span className="truncate">
          <Highlight text={threadTitle(m, thread)} terms={terms} />
        </span>
        {thread.archivedAt && <Badge>{m.search.archived}</Badge>}
      </span>
      <Meta>
        {[<span key="w">{workspace(thread.workspaceId)}</span>, <span key="t">{relativeTime(m, locale, thread.updatedAt)}</span>]}
      </Meta>
    </Row>
  )
}

function MessageResult({ hit, terms }: { hit: MessageHit; terms: string[] }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const mine = hit.type === 'userMessage'
  return (
    <Row icon={mine ? <User size={14} /> : <Bot size={14} />} onOpen={() => void openThreadAt(hit.threadId, hit.itemId, hit.seq)}>
      <span className="line-clamp-2 text-ui break-words text-fg">
        <Highlight text={hit.snippet} terms={terms} />
      </span>
      <Meta>
        {[
          <span key="who">{mine ? m.search.you : m.search.agent}</span>,
          <span key="in" className="truncate">
            {m.search.inThread(threadTitle(m, { title: hit.threadTitle }))}
          </span>,
          <span key="at">{relativeTime(m, locale, hit.at)}</span>,
        ]}
      </Meta>
    </Row>
  )
}

function TaskResult({ job, terms }: { job: CronJobView; terms: string[] }) {
  const m = useT()
  return (
    <Row icon={<CalendarClock size={14} />} onOpen={() => go({ kind: 'cron' })}>
      <span className="text-ui text-fg">
        <Highlight text={job.name} terms={terms} />
      </span>
      <span className="line-clamp-1 text-small text-fg-muted">
        <Highlight text={job.prompt} terms={terms} />
      </span>
      <Meta>{[<span key="in">{m.search.inThread(threadTitle(m, { title: job.threadTitle }))}</span>]}</Meta>
    </Row>
  )
}

function MemoryResult({ memory, terms }: { memory: MemoryRow; terms: string[] }) {
  const m = useT()
  const workspace = useWorkspaceName()
  return (
    <Row icon={<Brain size={14} />} onOpen={() => go({ kind: 'memory' })}>
      <span className="line-clamp-2 text-ui break-words text-fg">
        <Highlight text={memory.text} terms={terms} />
      </span>
      <Meta>{[<span key="kind">{kindLabel(m, memory.kind)}</span>, <span key="scope">{scopeLabel(m, memory, workspace)}</span>]}</Meta>
    </Row>
  )
}

function kindLabel(m: Messages, kind: string): string {
  const kinds: Record<string, string | undefined> = m.memory.entry.kinds
  return Object.hasOwn(kinds, kind) ? kinds[kind]! : kind
}

function scopeLabel(m: Messages, memory: MemoryRow, workspace: (id: string | undefined) => string): string {
  if (memory.scope === 'global') return m.memory.screen.global
  if (memory.scope === 'general') return m.memory.screen.general
  return workspace(memory.workspaceId)
}
