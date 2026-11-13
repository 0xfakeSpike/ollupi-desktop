// Notices of what finished or failed while the person was elsewhere. They sit
// at the bottom right of the screen's column when it has one beside its
// panels (ToastHost), so they never lie over a panel, where the browser's page
// is drawn above the interface; elsewhere at the window's bottom right.

import { cn, IconButton } from '@ollupi/ui'
import { CircleAlert, Info, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { useNotices } from '../../domains/notices'
import { useT } from '../../i18n'

const useHost = create<{ el: HTMLElement | null }>(() => ({ el: null }))

/** Where the notices go on a screen with side panels: its column's bottom
 * right. Under a panel that lies over the column as a sheet, like the rest of
 * the column. */
export function ToastHost() {
  return <div ref={(el) => useHost.setState({ el })} className="pointer-events-none absolute right-4 bottom-4 flex w-90 max-w-[calc(100%-2rem)] flex-col gap-2" />
}

export function Toasts() {
  const notices = useNotices((s) => s.notices)
  const dismiss = useNotices((s) => s.dismiss)
  const host = useHost((s) => s.el)
  const m = useT()
  if (notices.length === 0) return null
  const list = notices.map((n) => {
    const Icon = n.tone === 'danger' ? CircleAlert : Info
    return (
      <div
        key={n.id}
        role={n.tone === 'danger' ? 'alert' : 'status'}
        className="pointer-events-auto flex animate-enter items-start gap-2 rounded-3xl bg-raised p-3.5 text-ui text-fg shadow-md dark:ring-1 dark:ring-line motion-reduce:animate-fade"
      >
        <Icon size={16} className={cn('mt-0.5 shrink-0', n.tone === 'danger' ? 'text-danger' : 'text-fg-muted')} aria-hidden />
        <span className="selectable min-w-0 flex-1 break-words">{n.message}</span>
        <IconButton label={m.common.dismiss} size="sm" className="-my-0.5 -mr-1" onClick={() => dismiss(n.id)}>
          <X size={14} />
        </IconButton>
      </div>
    )
  })
  if (host) return createPortal(list, host)
  return <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-90 flex-col gap-2">{list}</div>
}
