// Shown until the backend is up and the first sync is done: starting,
// connecting, or a startup failure and what to do about it.

import { Button, Callout, Spinner } from '@ollupi/ui'
import { FileCog, RotateCw, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { BackendFailure } from '../../../../shared/ipc'
import { useConnection } from '../../gateway/connection'
import { useT, type Messages } from '../../i18n'
import { desktop } from '../../platform/desktop'

export function BackendScreen() {
  const backend = useConnection((s) => s.backend)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)
  const m = useT().shell.backend

  if (backend.status === 'failed') {
    return (
      <Shell>
        <Failure failure={backend.failure} configPath={backend.configPath} log={backend.log} />
      </Shell>
    )
  }
  const label =
    backend.status === 'starting' ? m.starting : backend.status === 'stopped' ? m.stopped : gateway === 'reconnecting' ? m.reconnecting : m.connecting
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-ui text-fg-muted">
        <Spinner size={20} />
        <div>{label}</div>
        {gateway === 'reconnecting' && lastError && <div className="text-small text-fg-subtle">{lastError}</div>}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="drag flex h-full items-center justify-center bg-ground p-8">{children}</div>
}

function Failure({ failure, configPath, log }: { failure: BackendFailure; configPath: string | undefined; log: string }) {
  const [restarting, setRestarting] = useState(false)
  const m = useT()
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <TriangleAlert size={20} className="text-danger" />
        <h1 className="text-display text-fg">{m.shell.backend.failed}</h1>
      </div>
      <Callout tone="danger">
        <span className="selectable text-fg">{failureText(m, failure)}</span>
      </Callout>
      {configPath && (
        <p className="text-ui text-fg-muted">
          {m.shell.backend.configuredIn(<code className="selectable font-mono text-small text-fg">{configPath}</code>)}
        </p>
      )}
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
          {m.common.restartBackend}
        </Button>
        {configPath && (
          <Button size="lg" icon={<FileCog size={16} />} onClick={() => void desktop.openPath(configPath)}>
            {m.shell.backend.openConfig}
          </Button>
        )}
      </div>
      {log && (
        <details className="text-small text-fg-muted">
          <summary className="cursor-pointer">{m.shell.backend.log}</summary>
          <pre className="selectable mt-2 max-h-64 overflow-auto rounded-lg bg-surface p-3 font-mono text-small whitespace-pre-wrap">{log}</pre>
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
  }
}
