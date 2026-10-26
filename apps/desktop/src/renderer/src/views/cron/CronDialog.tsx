// A thread's scheduled tasks: each sends its prompt to this thread on its
// schedule, like a message from the user (queued if the thread is busy).

import { relativeTime } from '@ollupi/core'
import type { CronJobRow } from '@ollupi/protocol'
import { Button, Dialog, EmptyState, Field, IconButton, Input, Spinner, Switch, Textarea } from '@ollupi/ui'
import { CalendarClock, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createJob, deleteJob, loadJobs, setPaused, useThreadJobs } from '../../domains/cron'

export function CronDialog({ threadId, onClose }: { threadId: string; onClose(): void }) {
  const jobs = useThreadJobs(threadId)
  useEffect(() => void loadJobs(threadId), [threadId])

  return (
    <Dialog title="Scheduled tasks" onClose={onClose} width={560}>
      <div className="flex flex-col gap-5">
        {!jobs ? (
          <div className="flex justify-center py-6 text-fg-subtle">
            <Spinner />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={<CalendarClock size={24} />} title="No scheduled tasks">
            Tasks send a message to this thread on a schedule. The agent can also create them when you ask it to.
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
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium text-fg">{job.name}</span>
          <code className="selectable font-mono text-xs text-fg-muted">{job.spec}</code>
        </div>
        <p className="selectable mt-0.5 line-clamp-2 text-xs text-fg-muted">{job.prompt}</p>
        <p className="mt-1 text-[11px] text-fg-subtle">
          {job.paused ? 'Paused' : `Next ${relativeTime(job.nextRunAt)} · ${new Date(job.nextRunAt).toLocaleString()}`}
        </p>
      </div>
      <Switch label={job.paused ? 'Resume' : 'Pause'} checked={!job.paused} onChange={(on) => void setPaused(job.threadId, job.name, !on)} />
      <IconButton
        label="Delete"
        size="sm"
        onClick={() => {
          if (confirm(`Delete the task “${job.name}”?`)) void deleteJob(job.threadId, job.name)
        }}
      >
        <Trash2 size={13} />
      </IconButton>
    </li>
  )
}

function NewJob({ threadId }: { threadId: string }) {
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
      <div className="text-xs font-medium text-fg-muted">New task</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" hint="Unique in this thread.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-summary" />
        </Field>
        <Field label="Schedule" hint="Cron fields or @daily, @hourly…, in local time.">
          <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="0 9 * * 1-5" className="font-mono" />
        </Field>
      </div>
      <Field label="Message">
        <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Summarize what changed in the repository since yesterday." />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" disabled={!ready} loading={saving} onClick={() => void create()}>
          Create task
        </Button>
      </div>
    </div>
  )
}
