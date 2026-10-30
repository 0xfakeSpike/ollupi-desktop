// Scheduled tasks: messages ollupi sends to a thread on a cron schedule.
// Every thread's tasks are listed once connected (cron/list without a
// thread), and ollupi reports each change after that as cron/changed, with
// the task as it is then: one the model or a cron/* call made, or the
// scheduler moving its next run on. It holds a change back until the list
// it follows is answered, so applying changes in order keeps the list
// current. The cron/* calls below change tasks; their results are not
// applied here, the notification is.

import type { CronJobView, ThreadRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

/** Undefined until the first list arrives. */
export const useCron = create<{ jobs: CronJobView[] | undefined }>()(() => ({ jobs: undefined }))

function applyChange(id: string, job: CronJobView | null): void {
  useCron.setState((s) => {
    if (!s.jobs) return s
    const rest = s.jobs.filter((j) => j.id !== id)
    return { jobs: job ? [...rest, job] : rest }
  })
}

/** A task shows its thread's title and whether it is archived (when ollupi
 * sends it nothing); those change with the thread, not the task. */
function applyThread(thread: ThreadRow): void {
  useCron.setState((s) =>
    s.jobs?.some((j) => j.threadId === thread.id)
      ? { jobs: s.jobs.map((j) => (j.threadId === thread.id ? { ...j, threadTitle: thread.title, threadArchived: !!thread.archivedAt } : j)) }
      : s,
  )
}

export const cronDomain: Domain = {
  bind: (client) => {
    const offs = [
      client.on('cron/changed', ({ id, job }) => applyChange(id, job)),
      client.on('thread/changed', ({ thread }) => thread && applyThread(thread)),
    ]
    return () => offs.forEach((off) => off())
  },
  sync: async (client) => {
    useCron.setState({ jobs: (await client.call('cron/list', {})).data })
  },
}

export function createJob(threadId: string, name: string, spec: string, prompt: string): Promise<boolean> {
  return run((e) => e.cron.create, async () => {
    await gateway().call('cron/create', { threadId, name, spec, prompt })
    return true
  }).then(Boolean)
}

export function setPaused(job: CronJobView, paused: boolean): Promise<void | undefined> {
  return run((e) => (paused ? e.cron.pause : e.cron.resume), async () => {
    await gateway().call('cron/pause', { threadId: job.threadId, name: job.name, paused })
  })
}

export function deleteJob(job: CronJobView): Promise<void | undefined> {
  return run((e) => e.cron.delete, async () => {
    await gateway().call('cron/delete', { threadId: job.threadId, name: job.name })
  })
}
