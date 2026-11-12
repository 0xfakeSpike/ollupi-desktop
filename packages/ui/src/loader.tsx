// Waiting on something that takes a while: three dots that brighten in
// turn. It shows only after 300ms, so a quick load shows nothing. The label
// is the verb ("Loading models…").

import { cn } from './cn'

export function Loader({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('loader flex items-center gap-2 text-ui text-fg-muted', className)}>
      <span aria-hidden className="flex gap-1">
        <span className="size-1.5 rounded-full" />
        <span className="size-1.5 rounded-full" />
        <span className="size-1.5 rounded-full" />
      </span>
      {label}
    </div>
  )
}
