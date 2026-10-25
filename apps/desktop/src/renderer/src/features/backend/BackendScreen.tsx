// Full-window state shown until the backend is up and the first sync is done:
// starting, connecting, or a startup failure with what to do about it.

import { Button, Spinner } from '@ollupi/ui'
import { FileCog, RotateCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { desktop } from '../../services/desktop'
import { useConnection } from '../../stores/connection'

export function BackendScreen() {
  const backend = useConnection((s) => s.backend)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)

  return (
    <div className="drag flex h-full items-center justify-center bg-canvas p-8">
      {backend.status === 'failed' ? (
        <Failure message={backend.message} configPath={backend.configPath} log={backend.log} />
      ) : (
        <div className="flex flex-col items-center gap-3 text-sm text-fg-muted">
          <Spinner size={20} />
          <div>{label(backend.status, gateway)}</div>
          {gateway === 'reconnecting' && lastError && <div className="text-xs text-fg-subtle">{lastError}</div>}
        </div>
      )}
    </div>
  )
}

function label(backend: string, gateway: string): string {
  if (backend === 'starting') return 'Starting the ollupi backend…'
  if (backend === 'stopped') return 'The backend is stopped.'
  if (gateway === 'reconnecting') return 'Reconnecting…'
  return 'Connecting…'
}

function Failure({ message, configPath, log }: { message: string; configPath?: string; log: string }) {
  const [restarting, setRestarting] = useState(false)
  return (
    <div className="no-drag flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2 text-danger">
        <TriangleAlert size={18} />
        <h1 className="text-base font-semibold">The backend could not start</h1>
      </div>
      <p className="selectable rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-fg">{message}</p>
      {configPath && (
        <p className="text-sm text-fg-muted">
          Settings live in <code className="selectable font-mono text-xs text-fg">{configPath}</code>. Fix the problem
          there, then restart the backend.
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
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11px] whitespace-pre-wrap">
            {log}
          </pre>
        </details>
      )}
    </div>
  )
}
