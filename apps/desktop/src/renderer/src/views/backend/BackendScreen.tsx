// Shown until the backend is up and the first sync is done: starting,
// connecting, or a startup failure and what to do about it.

import { Button, Callout, Loader } from '@ollupi/ui'
import { Globe, RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { LOCAL_SERVER, type BackendFailure } from '../../../../shared/ipc'
import { openPath } from '../../domains/files'
import { useConnection } from '../../gateway/connection'
import { useT, type Messages } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { ServersDialog } from '../settings/ServersSection'

export function BackendScreen() {
  const backend = useConnection((s) => s.backend)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)
  const m = useT().shell.backend
  // The settings are out of reach until the first sync, so a server that
  // cannot be reached is changed from here.
  const [onServer, setOnServer] = useState(false)
  useEffect(() => void desktop.servers.read().then((s) => setOnServer(s.active !== LOCAL_SERVER)), [backend])

  if (backend.status === 'failed') {
    return (
      <Shell>
        <Failure failure={backend.failure} log={backend.log} />
      </Shell>
    )
  }
  const label =
    backend.status === 'starting' ? m.starting : backend.status === 'stopped' ? m.stopped : gateway === 'reconnecting' ? m.reconnecting : m.connecting
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-ui text-fg-muted">
        <Loader label={label} />
        {gateway === 'reconnecting' && lastError && <div className="text-small text-fg-subtle">{lastError}</div>}
        {onServer && <ConnectionSettings />}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="drag flex h-full items-center justify-center bg-canvas p-8">{children}</div>
}

function Failure({ failure, log }: { failure: BackendFailure; log: string }) {
  const [restarting, setRestarting] = useState(false)
  const m = useT()
  const remote = failure.kind === 'remote'
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <TriangleAlert size={20} className="text-danger" />
        <h1 className="text-display text-fg">{remote ? m.shell.backend.remoteFailed : m.shell.backend.failed}</h1>
      </div>
      <Callout tone="danger">
        <span className="selectable text-fg">{failureText(m, failure)}</span>
      </Callout>
      <div className="flex gap-2">
        <Button
          size="lg"
          variant="primary"
          icon={<RotateCw size={16} />}
          loading={restarting}
          onClick={() => {
            setRestarting(true)
            void desktop.backend.restart().finally(() => setRestarting(false))
          }}
        >
          {remote ? m.shell.backend.retry : m.common.restartBackend}
        </Button>
        <ConnectionSettings />
      </div>
      {log && (
        <details className="text-small text-fg-muted">
          <summary className="cursor-pointer">{m.shell.backend.log}</summary>
          <pre className="selectable mt-2 max-h-64 overflow-auto rounded-2xl bg-surface p-4 font-mono text-small whitespace-pre-wrap">{log}</pre>
        </details>
      )}
    </div>
  )
}

function failureText(m: Messages, f: BackendFailure): string {
  const w = m.shell.backend.failure
  switch (f.kind) {
    case 'timeout':
      return w.timeout(f.seconds)
    case 'spawn':
      return w.spawn(f.binary, f.error)
    case 'exited':
      return w.exited(f.how)
    case 'reported':
      return f.message ?? w.reported
    case 'remote':
      return w.remote[f.refused](f.url)
  }
}

/** The servers to choose among, while the settings cannot be reached. */
function ConnectionSettings() {
  const [open, setOpen] = useState(false)
  const m = useT().shell.backend
  return (
    <>
      <Button size="lg" icon={<Globe size={16} />} onClick={() => setOpen(true)}>
        {m.connectionSettings}
      </Button>
      {open && <ServersDialog onClose={() => setOpen(false)} />}
    </>
  )
}
