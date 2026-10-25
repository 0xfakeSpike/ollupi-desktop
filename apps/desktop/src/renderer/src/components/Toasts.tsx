import { cn, IconButton } from '@ollupi/ui'
import { X } from 'lucide-react'
import { useNotices } from '../stores/notices'

export function Toasts() {
  const notices = useNotices((s) => s.notices)
  const dismiss = useNotices((s) => s.dismiss)
  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2">
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border bg-raised px-3 py-2.5 text-sm shadow-lg',
            n.tone === 'danger' ? 'border-danger/40 text-danger' : 'border-line text-fg',
          )}
        >
          <span className="selectable flex-1 break-words">{n.message}</span>
          <IconButton label="Dismiss" size="sm" onClick={() => dismiss(n.id)}>
            <X size={12} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
