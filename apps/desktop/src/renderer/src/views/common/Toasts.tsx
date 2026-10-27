import { cn, IconButton } from '@ollupi/ui'
import { CircleAlert, Info, X } from 'lucide-react'
import { useNotices } from '../../domains/notices'
import { useT } from '../../i18n'

export function Toasts() {
  const notices = useNotices((s) => s.notices)
  const dismiss = useNotices((s) => s.dismiss)
  const m = useT()
  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-90 flex-col gap-2">
      {notices.map((n) => {
        const Icon = n.tone === 'danger' ? CircleAlert : Info
        return (
          <div
            key={n.id}
            role={n.tone === 'danger' ? 'alert' : 'status'}
            className="pointer-events-auto flex animate-enter items-start gap-2 rounded-xl border border-line bg-raised p-3 text-ui text-fg shadow-md motion-reduce:animate-fade"
          >
            <Icon size={16} className={cn('mt-0.5 shrink-0', n.tone === 'danger' ? 'text-danger' : 'text-fg-muted')} aria-hidden />
            <span className="selectable min-w-0 flex-1 break-words">{n.message}</span>
            <IconButton label={m.common.dismiss} size="sm" className="-my-0.5 -mr-1" onClick={() => dismiss(n.id)}>
              <X size={14} />
            </IconButton>
          </div>
        )
      })}
    </div>
  )
}
