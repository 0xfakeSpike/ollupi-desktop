// Every thread's scheduled tasks in one place, by workspace. A task sends
// its prompt to its thread on its schedule, like a message from the user
// (queued if the thread is busy). ollupi skips a run while the thread's
// workspace is archived, and a subagent thread takes no messages.

import { isTopLevel } from '@ollupi/core'
import type { CronJobView, WorkspaceRow } from '@ollupi/protocol'
import { Badge, Button, EmptyState, Field, IconButton, Input, Select, Spinner, Switch, Tabs, Textarea } from '@ollupi/ui'
import { CalendarClock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { openThread } from '../../domains/conversation'
import { createJob, deleteJob, setPaused, useCron } from '../../domains/cron'
import { useThreads } from '../../domains/threads'
import { useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { relativeTime, threadTitle } from '../../i18n/format'

/** The list shown: every task, those outside any workspace, or one
 * workspace's. */
const ALL = 'all'
const GENERAL = 'general'

const placeOf = (job: { workspaceId?: string }): string => job.workspaceId ?? GENERAL

export function CronScreen() {
  const m = useT()
  const jobs = useCron((s) => s.jobs)
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
      <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-line pr-2 pl-4">
        <h1 className="text-ui font-semibold">{m.cron.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-line p-2">
          <Tabs label={m.cron.scope} orientation="vertical" tabs={places} value={place} onChange={setPlace} />
        </nav>
        <div role="tabpanel" id={`panel-${place}`} aria-labelledby={`tab-${place}`} className="scroll-centered flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-6">
            {!jobs ? (
              <div className="flex justify-center py-12 text-fg-subtle">
                <Spinner />
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
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
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
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <span className="font-medium text-fg">{job.name}</span>
          <code className="selectable font-mono text-small text-fg-muted">{job.spec}</code>
          {job.parentThreadId ? <Badge tone="danger">{m.cron.subagent}</Badge> : archived && <Badge>{m.cron.archived}</Badge>}
        </div>
        <p className="selectable mt-0.5 line-clamp-2 text-small text-fg-muted">{job.prompt}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-small text-fg-subtle">
          <span>{m.cron.inThread}</span>
          <button type="button" className="min-w-0 truncate text-fg-muted hover:text-fg hover:underline" onClick={() => void openThread(job.threadId)}>
            {threadTitle(m, { preview: job.threadPreview })}
          </button>
          {showWorkspace && <span>· {workspace?.name ?? m.cron.general}</span>}
        </div>
        <p className="mt-0.5 text-small text-fg-subtle">
          {job.paused ? m.cron.paused : m.cron.next(relativeTime(m, locale, job.nextRunAt), new Date(job.nextRunAt).toLocaleString(locale))}
          {' · '}
          {job.lastRunAt ? m.cron.lastRun(relativeTime(m, locale, job.lastRunAt)) : m.cron.neverRun}
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
 * threads take no messages. The threads offered are those the sidebar
 * loaded. */
function NewJob({ place, workspaces }: { place: string; workspaces: WorkspaceRow[] }) {
  const m = useT()
  const threads = useThreads((s) => s.list)
  const active = (id: string | undefined) => !id || workspaces.some((w) => w.id === id && !w.archivedAt)
  const options = threads.filter((t) => isTopLevel(t) && active(t.workspaceId) && (place === ALL || placeOf(t) === place))
  const [threadId, setThreadId] = useState('')
  const [name, setName] = useState('')
  const [spec, setSpec] = useState('')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const target = options.find((t) => t.id === threadId) ?? options[0]
  const ready = target && name.trim() && spec.trim() && prompt.trim()
  const label = (t: (typeof options)[number]) =>
    place === ALL ? `${workspaces.find((w) => w.id === t.workspaceId)?.name ?? m.cron.general} · ${threadTitle(m, t)}` : threadTitle(m, t)

  const create = async () => {
    if (!target) return
    setSaving(true)
    if (await createJob(target.id, name.trim(), spec.trim(), prompt.trim())) {
      setName('')
      setSpec('')
      setPrompt('')
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong p-4">
      <div className="text-small font-medium text-fg-muted">{m.cron.newTask}</div>
      {options.length === 0 ? (
        <p className="text-small text-fg-subtle">{m.cron.noThreads}</p>
      ) : (
        <>
          <Field label={m.cron.thread} hint={m.cron.threadHint}>
            <Select value={target?.id} onChange={(e) => setThreadId(e.target.value)}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {label(t)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.cron.name} hint={m.cron.nameHint}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-summary" />
            </Field>
            <Field label={m.cron.schedule} hint={m.cron.scheduleHint}>
              <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="0 9 * * 1-5" className="font-mono" />
            </Field>
          </div>
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
    </div>
  )
}
