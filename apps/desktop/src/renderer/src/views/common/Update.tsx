import { Button } from '@ollupi/ui'
import { CircleAlert, Download, RotateCw } from 'lucide-react'
import { RELEASES_URL, type UpdateState } from '../../../../shared/ipc'
import { putOff, updateVersion, useUpdate } from '../../domains/update'
import { useT, type Messages } from '../../i18n'
import { desktop } from '../../platform/desktop'

/** Asks before an update is downloaded, then shows it through to the
 * restart. Sits at the foot of the sidebar, out of the conversation's way,
 * while there is a release to act on that the person has not put off. */
export function UpdatePrompt() {
  const state = useUpdate((s) => s.state)
  const later = useUpdate((s) => s.putOff)
  const m = useT().shell.update
  const version = updateVersion(state)
  if (!version || version === later || state.status === 'checking') return null
  const failed = state.status === 'failed'
  return (
    <div role={failed ? 'alert' : 'status'} className="mb-2 flex animate-enter flex-col gap-2 rounded-lg border border-line bg-raised p-2.5 text-ui text-fg motion-reduce:animate-fade">
      <div className="flex items-start gap-2">
        {failed ? (
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        ) : (
          <Download size={16} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">{headline(state, m)}</div>
          {detail(state, m) && <div className="selectable mt-0.5 text-small break-words text-fg-muted">{detail(state, m)}</div>}
          <a href={`${RELEASES_URL}/tag/v${version}`} target="_blank" className="mt-0.5 inline-block text-small text-fg-muted hover:text-fg hover:underline">
            {m.notes}
          </a>
        </div>
      </div>
      {state.status === 'downloading' && <Progress received={state.received} total={state.total} />}
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => putOff(version)}>
          {m.later}
        </Button>
        <Action state={state} />
      </div>
    </div>
  )
}

/** The settings row: what the updater is doing, and the next step. */
export function UpdateSettings() {
  const state = useUpdate((s) => s.state)
  const m = useT().shell.update
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line px-4 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-ui font-medium text-fg">{m.title}</div>
          <div className="selectable mt-0.5 text-small break-words text-fg-muted">{headline(state, m)}</div>
          {detail(state, m) && <div className="selectable mt-0.5 text-small break-words text-fg-muted">{detail(state, m)}</div>}
        </div>
        <Action state={state} />
      </div>
      {state.status === 'downloading' && <Progress received={state.received} total={state.total} />}
    </div>
  )
}

/** The one step the state allows: check, download, restart or retry. */
function Action({ state }: { state: UpdateState }) {
  const m = useT().shell.update
  switch (state.status) {
    case 'idle':
    case 'latest':
    case 'checking':
      return (
        <Button size="sm" icon={<RotateCw size={14} />} loading={state.status === 'checking'} onClick={() => void desktop.update.check()}>
          {m.check}
        </Button>
      )
    case 'available':
      return (
        <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={() => void desktop.update.download()}>
          {m.install}
        </Button>
      )
    case 'ready':
      return (
        <Button size="sm" variant="primary" onClick={() => void desktop.update.restart()}>
          {m.restart}
        </Button>
      )
    case 'failed':
      return (
        <Button size="sm" onClick={() => void (state.version ? desktop.update.download() : desktop.update.check())}>
          {m.retry}
        </Button>
      )
    case 'downloading':
    case 'unsupported':
      return null
  }
}

function Progress({ received, total }: { received: number; total: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-hover">
      <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-standard" style={{ width: `${percent(received, total)}%` }} />
    </div>
  )
}

function headline(state: UpdateState, m: Messages['shell']['update']): string {
  switch (state.status) {
    case 'unsupported':
      return m.unsupported
    case 'idle':
      return m.idle
    case 'checking':
      return m.checking
    case 'latest':
      return m.latest
    case 'available':
      return m.available(state.version)
    case 'downloading':
      return m.downloading(state.version, percent(state.received, state.total))
    case 'ready':
      return m.ready(state.version)
    case 'failed':
      return state.version ? m.downloadFailed(state.version) : m.checkFailed
  }
}

function detail(state: UpdateState, m: Messages['shell']['update']): string | undefined {
  if (state.status === 'ready') return m.readyHint
  if (state.status !== 'failed') return undefined
  return state.failure.kind === 'location' ? m.location(state.failure.path) : state.failure.message
}

function percent(received: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((received * 100) / total)) : 0
}
