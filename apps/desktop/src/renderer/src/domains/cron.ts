// Scheduled tasks: messages ollupi sends to a thread on a cron schedule. A
// thread's tasks are read when someone looks at them. They change through
// the cron/* calls below, which return the stored row, and through the
// model's own cron tool calls, which the gateway reports only as completed
// items from the cron provider; either way the loaded list is updated.

import type { CronJobRow, Provider } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

/** The cron provider's id, as the contract lists it. */
const CRON: Provider = 'cron'

export const useCron = create<{ byThread: Record<string, CronJobRow[]> }>()(() => ({ byThread: {} }))

function set(threadId: string, jobs: CronJobRow[]): void {
  useCron.setState((s) => ({ byThread: { ...s.byThread, [threadId]: jobs } }))
}

async function read(threadId: string): Promise<void> {
  set(threadId, (await gateway().call('cron/list', { threadId })).data)
}

export const cronDomain: Domain = {
  bind: (client) =>
    client.on('item/completed', ({ threadId, item }) => {
      if (item.server === CRON && threadId in useCron.getState().byThread) {
        void run('Could not refresh scheduled tasks', () => read(threadId))
      }
    }),
  // Lists read before a reconnect may have changed meanwhile.
  sync: async () => {
    await Promise.all(Object.keys(useCron.getState().byThread).map(read))
  },
}

export function useThreadJobs(threadId: string): CronJobRow[] | undefined {
  return useCron((s) => s.byThread[threadId])
}

export function loadJobs(threadId: string): Promise<void | undefined> {
  return run('Could not load scheduled tasks', () => read(threadId))
}

function replace(row: CronJobRow): void {
  const jobs = useCron.getState().byThread[row.threadId] ?? []
  set(row.threadId, jobs.some((j) => j.id === row.id) ? jobs.map((j) => (j.id === row.id ? row : j)) : [...jobs, row])
}

export function createJob(threadId: string, name: string, spec: string, prompt: string): Promise<boolean> {
  return run('Could not create the task', async () => {
    replace(await gateway().call('cron/create', { threadId, name, spec, prompt }))
    return true
  }).then(Boolean)
}

export function setPaused(threadId: string, name: string, paused: boolean): Promise<void | undefined> {
  return run(paused ? 'Could not pause the task' : 'Could not resume the task', async () => {
    replace(await gateway().call('cron/pause', { threadId, name, paused }))
  })
}

export function deleteJob(threadId: string, name: string): Promise<void | undefined> {
  return run('Could not delete the task', async () => {
    await gateway().call('cron/delete', { threadId, name })
    set(threadId, (useCron.getState().byThread[threadId] ?? []).filter((j) => j.name !== name))
  })
}
