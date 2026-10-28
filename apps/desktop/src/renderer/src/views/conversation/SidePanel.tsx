// The frame of a panel beside a conversation: its title and close button
// over a body that scrolls on its own.

import { cn, IconButton } from '@ollupi/ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { togglePanel, type Panel } from '../../domains/navigation'

export function SidePanel({
  panel,
  title,
  closeLabel,
  actions,
  width = 'normal',
  bare,
  children,
}: {
  panel: Panel
  title: string
  closeLabel: string
  /** Buttons beside the close button. */
  actions?: ReactNode
  /** wide for content read at length, such as a file; half for a web page. */
  width?: 'normal' | 'wide' | 'half'
  /** The body without padding or its own scrolling, for content that lays
   * itself out. */
  bare?: boolean
  children: ReactNode
}) {
  return (
    <aside
      className={cn(
        'my-2 mr-2 flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-canvas',
        width === 'half' ? 'w-1/2' : width === 'wide' ? 'w-112' : 'w-80',
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <h2 className="flex-1 truncate text-ui font-semibold">{title}</h2>
        {actions}
        <IconButton label={closeLabel} size="sm" onClick={() => togglePanel(panel)}>
          <X size={14} />
        </IconButton>
      </div>
      {bare ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>}
    </aside>
  )
}
