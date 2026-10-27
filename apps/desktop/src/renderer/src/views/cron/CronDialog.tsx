// A thread's scheduled tasks: each sends its prompt to this thread on its
// schedule, like a message from the user (queued if the thread is busy).

import type { CronJobRow } from '@ollupi/protocol'
import { Button, Dialog, EmptyState, Field, IconButton, Input, Spinner, Switch, Textarea } from '@ollupi/ui'
import { CalendarClock, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createJob, deleteJob, loadJobs, setPaused, useThreadJobs } from '../../domains/cron'
import { useLocale, useT } from '../../i18n'
import { relativeTime } from '../../i18n/format'

export function CronDialog({ threadId, onClose }: { threadId: string; onClose(): void }) {
  const m = useT()
  const jobs = useThreadJobs(threadId)
  useEffect(() => void loadJobs(threadId), [threadId])

  return (
    <Dialog title={m.requests.cron.title} closeLabel={m.common.close} onClose={onClose} width={560}>
      <div className="flex flex-col gap-5">
        {!jobs ? (
          <div className="flex justify-center py-6 text-fg-subtle">
            <Spinner />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={<CalendarClock size={24} />} title={m.requests.cron.empty}>
            {m.requests.cron.emptyHint}
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {jobs.map((j) => (
              <Job key={j.id} job={j} />
            ))}
          </ul>
        )}
        <NewJob threadId={threadId} />
      </div>
    </Dialog>
  )
}

function Job({ job }: { job: CronJobRow }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium text-fg">{job.name}</span>
          <code className="selectable font-mono text-xs text-fg-muted">{job.spec}</code>
        </div>
        <p className="selectable mt-0.5 line-clamp-2 text-xs text-fg-muted">{job.prompt}</p>
        <p className="mt-1 text-[11px] text-fg-subtle">
          {job.paused
            ? m.requests.cron.paused
            : m.requests.cron.next(relativeTime(m, locale, job.nextRunAt), new Date(job.nextRunAt).toLocaleString(locale))}
        </p>
      </div>
      <Switch label={job.paused ? m.requests.cron.resume : m.requests.cron.pause} checked={!job.paused} onChange={(on) => void setPaused(job.threadId, job.name, !on)} />
      <IconButton
        label={m.requests.cron.delete}
        size="sm"
        onClick={() => {
          if (confirm(m.requests.cron.deleteConfirm(job.name))) void deleteJob(job.threadId, job.name)
        }}
      >
        <Trash2 size={13} />
      </IconButton>
    </li>
  )
}

function NewJob({ threadId }: { threadId: string }) {
  const m = useT()
  const [name, setName] = useState('')
  const [spec, setSpec] = useState('')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const ready = name.trim() && spec.trim() && prompt.trim()

  const create = async () => {
    setSaving(true)
    if (await createJob(threadId, name.trim(), spec.trim(), prompt.trim())) {
      setName('')
      setSpec('')
      setPrompt('')
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4">
      <div className="text-xs font-medium text-fg-muted">{m.requests.cron.newTask}</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={m.requests.cron.name} hint={m.requests.cron.nameHint}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-summary" />
        </Field>
        <Field label={m.requests.cron.schedule} hint={m.requests.cron.scheduleHint}>
          <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="0 9 * * 1-5" className="font-mono" />
        </Field>
      </div>
      <Field label={m.requests.cron.message}>
        <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={m.requests.cron.messagePlaceholder} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" disabled={!ready} loading={saving} onClick={() => void create()}>
          {m.requests.cron.create}
        </Button>
      </div>
    </div>
  )
}
