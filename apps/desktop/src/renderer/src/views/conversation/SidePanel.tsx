// The frame of a panel beside a conversation: its title and close button
// over a body that scrolls on its own.

import { IconButton } from '@ollupi/ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { togglePanel, type Panel } from '../../domains/navigation'

export function SidePanel({ panel, title, closeLabel, children }: { panel: Panel; title: string; closeLabel: string; children: ReactNode }) {
  return (
    <aside className="my-2 mr-2 flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <h2 className="text-ui font-semibold">{title}</h2>
        <IconButton label={closeLabel} size="sm" onClick={() => togglePanel(panel)}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  )
}
