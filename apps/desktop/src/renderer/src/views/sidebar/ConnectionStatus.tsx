import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'

/** Says so only when the backend is not there: connected is how it should
 * be, and says nothing (DESIGN.md 3.3). */
export function ConnectionStatus() {
  const backend = useConnection((s) => s.backend.status)
  const gateway = useConnection((s) => s.gateway)
  const lastError = useConnection((s) => s.lastError)
  const m = useT().shell.connection
  if (backend === 'ready' && gateway === 'connected') return null
  const text = backend === 'starting' ? m.starting : backend === 'stopped' ? m.stopped : m.reconnecting
  return (
    <div role="status" className="flex h-8 min-w-0 items-center gap-2 px-2 text-small text-fg-subtle" title={lastError}>
      <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-danger" />
      <span className="truncate">{text}</span>
    </div>
  )
}
