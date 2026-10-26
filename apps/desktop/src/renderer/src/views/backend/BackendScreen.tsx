// Shown until the backend is up and the first sync is done: starting,
// connecting, or a startup failure and what to do about it.

import { Button, Callout, Spinner } from '@ollupi/ui'
import { FileCog, RotateCw, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useConnection } from '../../gateway/connection'
import { desktop } from '../../platform/desktop'

export function BackendScreen() {
  const backend = useConnection((s) => s.backend)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)

  if (backend.status === 'failed') {
    return (
      <Shell>
        <Failure message={backend.message} configPath={backend.configPath} log={backend.log} />
      </Shell>
    )
  }
  const label =
    backend.status === 'starting'
      ? 'Starting the ollupi backend…'
      : backend.status === 'stopped'
        ? 'The backend is stopped.'
        : gateway === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connecting…'
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-sm text-fg-muted">
        <Spinner size={20} />
        <div>{label}</div>
        {gateway === 'reconnecting' && lastError && <div className="text-xs text-fg-subtle">{lastError}</div>}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="drag flex h-full items-center justify-center bg-canvas p-8">{children}</div>
}

function Failure({ message, configPath, log }: { message: string; configPath: string | undefined; log: string }) {
  const [restarting, setRestarting] = useState(false)
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2 text-danger">
        <TriangleAlert size={18} />
        <h1 className="text-base font-semibold">The backend could not start</h1>
      </div>
      <Callout tone="danger">
        <span className="selectable text-fg">{message}</span>
      </Callout>
      {configPath && (
        <p className="text-sm text-fg-muted">
          The backend is configured in <code className="selectable font-mono text-xs text-fg">{configPath}</code>. Fix it there,
          then restart the backend.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon={<RotateCw size={14} />}
          loading={restarting}
          onClick={() => {
            setRestarting(true)
            void desktop.backend.restart().finally(() => setRestarting(false))
          }}
        >
          Restart backend
        </Button>
        {configPath && (
          <Button icon={<FileCog size={14} />} onClick={() => void desktop.openPath(configPath)}>
            Open config
          </Button>
        )}
      </div>
      {log && (
        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer">Backend log</summary>
          <pre className="selectable mt-2 max-h-64 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11px] whitespace-pre-wrap">{log}</pre>
        </details>
      )}
    </div>
  )
}
