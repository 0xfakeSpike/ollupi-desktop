// The Super Agent's plan beside its conversations, read from the files it
// keeps in its folder (domains/plan) and drawn as a list: the tasks not
// assigned yet, then those a project's conversation works on, each with its
// project, where its conversation stands and a way into it; under them the
// archive, a month at a time. The app does not change the files: the Super
// Agent writes them, and the user changes them by telling it so, or in the
// files. What a file holds besides its tasks shows as written, so nothing
// in it is hidden.

import { HUB_DONE_FOLDER, HUB_PLAN_FILE, isWorking, needsUser, parsePlan, unread, type PlanItem } from '@ollupi/core'
import type { WorkspaceRow } from '@ollupi/protocol'
import { cn, Details, EmptyState, IconButton } from '@ollupi/ui'
import { ArrowUpRight, ExternalLink, ListTodo, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { openThread } from '../../domains/conversation'
import { openPath } from '../../domains/files'
import { readDoneMonth, refreshPlan, usePlan } from '../../domains/plan'
import { useThreadRow } from '../../domains/threads'
import { useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'
import { areaClass } from '../common/areas'
import { ThreadWorkspace } from '../common/FileLink'
import { Markdown, type MarkdownFile } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function TodosPanel({ hub }: { hub: WorkspaceRow }) {
  const m = useT()
  const t = m.conversation.todos
  const { text, months, version } = usePlan()
  // Opening the panel reads the files again: the user may have edited them.
  useEffect(() => void refreshPlan(), [])
  const plan = useMemo(() => parsePlan(text ?? ''), [text])
  const file = useMemo(() => ({ root: hub.rootPath, path: HUB_PLAN_FILE, version }), [hub.rootPath, version])
  const open = plan.items.filter((i) => i.state === 'open')
  const unassigned = open.filter((i) => !i.thread)
  const inProgress = open.filter((i) => i.thread)

  return (
    <SidePanel
      panel="todos"
      title={t.title}
      closeLabel={t.close}
      actions={
        <>
          <IconButton label={t.reload} size="sm" onClick={() => void refreshPlan()}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton label={t.openFile(HUB_PLAN_FILE)} size="sm" onClick={() => void openPath(`${hub.rootPath}/${HUB_PLAN_FILE}`)}>
            <ExternalLink size={14} />
          </IconButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {open.length === 0 && !(text?.trim() && plan.rest) ? (
          <EmptyState icon={<ListTodo size={20} />} title={t.emptyTitle}>
            {t.empty}
          </EmptyState>
        ) : open.length === 0 ? (
          // Written otherwise than one line a task: shown as it is.
          <Written hub={hub} text={text!} file={file} />
        ) : (
          <>
            <PlanGroup title={t.unassigned} items={unassigned} />
            <PlanGroup title={t.inProgress} items={inProgress} />
            {plan.rest && <Other hub={hub} text={text!} file={file} />}
          </>
        )}
        {months.length > 0 && <Archive hub={hub} months={months} version={version} />}
      </div>
    </SidePanel>
  )
}

/** A file as the Super Agent wrote it; its links open what they name. */
function Written({ hub, text, file }: { hub: WorkspaceRow; text: string; file: MarkdownFile }) {
  return (
    <ThreadWorkspace.Provider value={hub.id}>
      <Markdown text={text} file={file} />
    </ThreadWorkspace.Provider>
  )
}

/** What a file holds besides its tasks, folded away. */
function Other({ hub, text, file }: { hub: WorkspaceRow; text: string; file: MarkdownFile }) {
  const t = useT().conversation.todos
  return (
    <Details summary={<span className="text-small text-fg-muted">{t.more}</span>}>
      <div className="pt-2">
        <Written hub={hub} text={text} file={file} />
      </div>
    </Details>
  )
}

/** Tasks under a heading that counts them, as one block of rows. */
function PlanGroup({ title, items }: { title?: string; items: PlanItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <h3 className="flex items-baseline justify-between px-1 text-small font-medium text-fg-subtle">
          <span>{title}</span>
          <span className="tabular-nums">{items.length}</span>
        </h3>
      )}
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        {items.map((item, i) => (
          <PlanRow key={i} item={item} />
        ))}
      </ul>
    </section>
  )
}

/** A task in two lines at most: what it is, with where its conversation
 * stands and a way into it on the right; then its project and its note. An
 * archived one reads quieter; a dropped one is struck through. */
function PlanRow({ item }: { item: PlanItem }) {
  const t = useT().conversation.todos
  const archived = item.state !== 'open'
  return (
    <li className="flex min-w-0 flex-col gap-1 py-2.5 pr-2.5 pl-4">
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <span className={cn('line-clamp-2 min-w-0 flex-1 text-ui break-words', archived ? 'text-fg-muted' : 'font-medium text-fg', item.state === 'dropped' && 'line-through')}>{item.task}</span>
        {item.state === 'dropped' && <span className="shrink-0 text-small text-fg-subtle">{t.dropped}</span>}
        {item.thread && <Conversation id={item.thread.id} title={item.thread.title} live={!archived} />}
      </div>
      {(item.project || item.note) && (
        <div className="flex min-w-0 items-start gap-2">
          {item.project && <Project name={item.project} />}
          {item.note && <p className="line-clamp-2 min-w-0 flex-1 text-small break-words text-fg-muted">{item.note}</p>}
        </div>
      )}
    </li>
  )
}

/** The project by name, in its workspace's colour when it is one. */
function Project({ name }: { name: string }) {
  const workspace = useWorkspaces((s) => s.list.find((w) => !w.archivedAt && w.name.toLowerCase() === name.toLowerCase()))
  return (
    <span className={cn('flex h-5 max-w-28 shrink-0 items-center rounded-full px-2 text-caption text-fg', workspace ? areaClass(workspace.id) : 'bg-canvas')}>
      <span className="truncate">{name}</span>
    </span>
  )
}

/** Where the conversation working on a task stands, as its sidebar row
 * says it (waiting for you, working, new since read), while the task is
 * open; and a button into it, named by the conversation's title. */
function Conversation({ id, title, live }: { id: string; title: string; live: boolean }) {
  const m = useT()
  const s = m.shell.sidebar
  const row = useThreadRow(id)
  const name = row ? threadTitle(m, row) : title || m.conversation.tool.openSubagent
  return (
    <span className="flex shrink-0 items-center gap-1">
      {live &&
        row &&
        (needsUser(row.status) ? (
          <span className="rounded-full bg-accent px-2 text-caption leading-5 font-semibold text-accent-fg">{s.yours}</span>
        ) : isWorking(row.status) ? (
          <span className="rounded-full bg-canvas px-2 text-caption leading-5 font-semibold text-fg-muted">{s.working}</span>
        ) : unread(row) ? (
          <span role="img" aria-label={s.unread} className="mx-1 size-1.5 rounded-full bg-fg" />
        ) : null)}
      <IconButton label={m.conversation.todos.openThread(name)} size="sm" onClick={() => void openThread(id)}>
        <ArrowUpRight size={14} />
      </IconButton>
    </span>
  )
}

/** The archive, a month at a time: the months as capsules, and the one
 * picked under them, drawn as the plan is. None is open at first. */
function Archive({ hub, months, version }: { hub: WorkspaceRow; months: string[]; version: number }) {
  const t = useT().conversation.todos
  const locale = useLocale((s) => s.locale)
  const [month, setMonth] = useState<string>()
  const [text, setText] = useState<string>()
  useEffect(() => {
    if (!month) return setText(undefined)
    let current = true
    void readDoneMonth(hub.rootPath, month).then((read) => current && setText(read))
    return () => {
      current = false
    }
  }, [hub.rootPath, month, version])
  const done = useMemo(() => parsePlan(text ?? ''), [text])
  const file = useMemo(() => ({ root: hub.rootPath, path: `${HUB_DONE_FOLDER}/${month}.md`, version }), [hub.rootPath, month, version])
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-small font-medium text-fg-subtle">{t.archive}</h3>
      <div className="flex flex-wrap gap-1.5">
        {months.map((mo) => (
          <button
            key={mo}
            type="button"
            aria-pressed={mo === month}
            onClick={() => setMonth(mo === month ? undefined : mo)}
            className={cn(
              'h-7 rounded-full px-3 text-small font-medium tabular-nums transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              mo === month ? 'bg-ink text-ink-fg' : 'bg-surface text-fg-muted hover:text-fg',
            )}
          >
            {monthName(mo, locale)}
          </button>
        ))}
      </div>
      {month &&
        text !== undefined &&
        (done.items.length > 0 ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <PlanGroup items={done.items} />
            {done.rest && <Other hub={hub} text={text} file={file} />}
          </div>
        ) : done.rest ? (
          <Written hub={hub} text={text} file={file} />
        ) : (
          <p className="px-1 pt-1 text-small text-fg-subtle">{t.noTasks}</p>
        ))}
    </section>
  )
}

/** 2026-11 as the locale says a month: 2026年11月, Nov 2026. */
function monthName(month: string, locale: string): string {
  const [y, mo] = month.split('-').map(Number)
  return new Date(y!, mo! - 1, 1).toLocaleDateString(locale, { year: 'numeric', month: 'short' })
}
