// Every thread's scheduled tasks in one place, by workspace. A task sends
// its prompt to its thread on its schedule, like a message from the user
// (queued if the thread is busy). ollupi skips a run while the thread's
// workspace is archived, and a subagent thread takes no messages.

import { cronSpec, isTopLevel, onceAt, scheduleOf } from '@ollupi/core'
import type { CronJobView, WorkspaceRow } from '@ollupi/protocol'
import { Badge, Button, EmptyState, Field, IconButton, Input, Select, Loader, Switch, Tabs, Textarea } from '@ollupi/ui'
import { CalendarClock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { openThread } from '../../domains/conversation'
import { createJob, deleteJob, setPaused, useCron } from '../../domains/cron'
import { useThreads } from '../../domains/threads'
import { activeWorkspaces, useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { clock, describeSchedule, monthDay, relativeTime, threadTitle } from '../../i18n/format'
import { useFound } from '../common/found'
import { defaultChoice, onceTime, SchedulePicker, type Choice } from './SchedulePicker'

/** The list shown: every task, those outside any workspace, or one
 * workspace's. */
const ALL = 'all'
const GENERAL = 'general'

const placeOf = (job: { workspaceId?: string }): string => job.workspaceId ?? GENERAL

export function CronScreen({ found }: { found?: string }) {
  const m = useT()
  const jobs = useCron((s) => s.jobs)
  useFound(found, !!jobs)
  const workspaces = useWorkspaces((s) => s.list)
  const [place, setPlace] = useState(ALL)

  const count = (p: string) => jobs && String(p === ALL ? jobs.length : jobs.filter((j) => placeOf(j) === p).length)
  const places = [
    { id: ALL, label: m.cron.all, detail: count(ALL) },
    { id: GENERAL, label: m.cron.general, detail: count(GENERAL) },
    ...workspaces.map((w) => ({ id: w.id, label: w.name, detail: count(w.id) })),
  ]
  const shown = (jobs ?? []).filter((j) => place === ALL || placeOf(j) === place).sort(byNextRun)

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-16 shrink-0 items-center gap-3 pr-4 pl-6">
        <h1 className="text-title">{m.cron.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto px-3 py-2">
          <Tabs label={m.cron.scope} orientation="vertical" tabs={places} value={place} onChange={setPlace} />
        </nav>
        <div role="tabpanel" id={`panel-${place}`} aria-labelledby={`tab-${place}`} className="scroll-centered flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-6">
            {!jobs ? (
              <div className="flex justify-center py-12">
                <Loader label={m.cron.loading} />
              </div>
            ) : shown.length === 0 ? (
              jobs.length > 0 ? (
                <EmptyState icon={<CalendarClock size={20} />} title={m.cron.emptyHere}>
                  {m.cron.emptyHereHint}
                </EmptyState>
              ) : (
                <EmptyState icon={<CalendarClock size={20} />} title={m.cron.empty}>
                  {m.cron.emptyHint}
                </EmptyState>
              )
            ) : (
              <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
                {shown.map((j) => (
                  <Job key={j.id} job={j} workspace={workspaces.find((w) => w.id === j.workspaceId)} showWorkspace={place === ALL} />
                ))}
              </ul>
            )}
            <NewJob place={place} workspaces={workspaces} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Soonest first; paused tasks, which have no next run, last. */
function byNextRun(a: CronJobView, b: CronJobView): number {
  if (a.paused !== b.paused) return a.paused ? 1 : -1
  return Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt)
}

function Job({ job, workspace, showWorkspace }: { job: CronJobView; workspace: WorkspaceRow | undefined; showWorkspace: boolean }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const archived = !!workspace?.archivedAt
  // A spec the model wrote in a shape the picker has no words for is shown
  // as written. A yearly task that runs once is said as once.
  const schedule = scheduleOf(job.spec)
  const once = job.times === 1 && schedule?.every === 'year'
  return (
    <li data-found-id={job.id} className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <span className="font-medium text-fg">{job.name}</span>
          {schedule ? (
            <span className="text-small text-fg-muted" title={job.spec}>
              {once ? m.cron.describe.once(monthDay(locale, schedule.month, schedule.date), clock(schedule.hour, schedule.minute)) : describeSchedule(m, locale, schedule)}
            </span>
          ) : (
            <code className="selectable font-mono text-small text-fg-muted">{job.spec}</code>
          )}
          {!once && job.times != null && <span className="text-small text-fg-muted">{m.cron.timesTotal(job.times)}</span>}
          {job.parentThreadId ? (
            <Badge tone="danger">{m.cron.subagent}</Badge>
          ) : archived ? (
            <Badge>{m.cron.archived}</Badge>
          ) : (
            job.threadArchived && <Badge>{m.cron.threadArchived}</Badge>
          )}
        </div>
        <p className="selectable mt-0.5 line-clamp-2 text-small text-fg-muted">{job.prompt}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-small text-fg-subtle">
          <span>{m.cron.inThread}</span>
          <button type="button" className="min-w-0 truncate text-fg-muted hover:text-fg hover:underline" onClick={() => void openThread(job.threadId)}>
            {threadTitle(m, { title: job.threadTitle })}
          </button>
          {showWorkspace && <span>· {workspace?.name ?? m.cron.general}</span>}
        </div>
        <p className="mt-0.5 text-small text-fg-subtle">
          {job.paused ? m.cron.paused : m.cron.next(relativeTime(m, locale, job.nextRunAt), new Date(job.nextRunAt).toLocaleString(locale))}
          {' · '}
          {job.lastRunAt ? m.cron.lastRun(relativeTime(m, locale, job.lastRunAt)) : m.cron.neverRun}
          {job.times != null && job.runs > 0 && ` · ${m.cron.runs(job.runs, job.times)}`}
        </p>
      </div>
      <Switch label={job.paused ? m.cron.resume : m.cron.pause} checked={!job.paused} onChange={(on) => void setPaused(job, !on)} />
      <IconButton
        label={m.cron.delete}
        size="sm"
        onClick={() => {
          if (confirm(m.cron.deleteConfirm(job.name))) void deleteJob(job)
        }}
      >
        <Trash2 size={14} />
      </IconButton>
    </li>
  )
}

/** A new task goes to an existing top-level thread of an active workspace
 * (or of none): ollupi skips runs in archived workspaces, and subagent
 * threads take no messages. The workspace is picked first, starting from the
 * one shown on the left, then one of its threads; those offered are the ones
 * the sidebar loaded. */
function NewJob({ place, workspaces }: { place: string; workspaces: WorkspaceRow[] }) {
  const m = useT()
  const threads = useThreads((s) => s.list)
  const active = activeWorkspaces(workspaces)
  const eligible = threads.filter((t) => isTopLevel(t) && (!t.workspaceId || active.some((w) => w.id === t.workspaceId)))
  const spaces = [{ id: GENERAL, name: m.cron.general }, ...active].filter((s) => eligible.some((t) => placeOf(t) === s.id))
  // A workspace picked here holds until another one is shown on the left.
  const [picked, setPicked] = useState({ place, space: place })
  const space = spaces.find((s) => s.id === (picked.place === place ? picked.space : place)) ?? spaces[0]
  const options = eligible.filter((t) => placeOf(t) === space?.id)
  const [threadId, setThreadId] = useState('')
  const [name, setName] = useState('')
  const [choice, setChoice] = useState<Choice>(defaultChoice)
  const [times, setTimes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const target = options.find((t) => t.id === threadId) ?? options[0]
  const count = times.trim() ? Number(times) : undefined
  const ready =
    target &&
    name.trim() &&
    prompt.trim() &&
    (choice.every === 'once' ? onceTime(choice) > new Date() : count === undefined || (Number.isInteger(count) && count >= 1))

  const create = async () => {
    if (!target) return
    setSaving(true)
    const [spec, runs] = choice.every === 'once' ? [cronSpec(onceAt(onceTime(choice))), 1] : [cronSpec(choice), count]
    if (await createJob(target.id, name.trim(), spec, prompt.trim(), runs)) {
      setName('')
      setChoice(defaultChoice)
      setTimes('')
      setPrompt('')
    }
    setSaving(false)
  }

  return (
    // A form on the sheet itself, under its own heading: no box around it.
    <section className="flex flex-col gap-3 pt-2">
      <h2 className="text-display text-fg">{m.cron.newTask}</h2>
      {spaces.length === 0 ? (
        <p className="text-small text-fg-subtle">{m.cron.noThreads}</p>
      ) : (
        <>
          <Field label={m.cron.workspace} hint={m.cron.workspaceHint}>
            <Select value={space?.id} onChange={(e) => setPicked({ place, space: e.target.value })}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.cron.thread} hint={m.cron.threadHint}>
            <Select value={target?.id} onChange={(e) => setThreadId(e.target.value)}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {threadTitle(m, t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.cron.name} hint={m.cron.nameHint}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-summary" />
          </Field>
          <Field label={m.cron.schedule} hint={m.cron.scheduleHint}>
            <SchedulePicker value={choice} onChange={setChoice} />
          </Field>
          {choice.every !== 'once' && (
            <Field label={m.cron.times} hint={m.cron.timesHint}>
              <Input type="number" min={1} step={1} className="w-32 tabular-nums" value={times} onChange={(e) => setTimes(e.target.value)} placeholder={m.cron.timesPlaceholder} />
            </Field>
          )}
          <Field label={m.cron.message}>
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={m.cron.messagePlaceholder} />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" disabled={!ready} loading={saving} onClick={() => void create()}>
              {m.cron.create}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
