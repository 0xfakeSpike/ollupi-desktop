import { cn } from '@ollupi/ui'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'

/** A quiet status line that only draws attention when not connected. */
export function ConnectionStatus() {
  const backend = useConnection((s) => s.backend.status)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)
  const m = useT().shell.connection
  const connected = backend === 'ready' && gateway === 'connected'
  const text = connected ? m.connected : backend === 'starting' ? m.starting : backend === 'stopped' ? m.stopped : m.reconnecting
  return (
    <div className="flex h-7 items-center gap-2 px-2 text-[11px] text-fg-subtle" title={connected ? undefined : lastError}>
      <span className={cn('size-1.5 rounded-full', connected ? 'bg-success' : 'animate-pulse bg-warning')} />
      {text}
    </div>
  )
}
