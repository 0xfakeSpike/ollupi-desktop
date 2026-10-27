import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

// Badges: a soft fill with the tone's text.
const tones: Record<Tone, string> = {
  neutral: 'bg-hover text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-4.5 items-center gap-1 rounded-sm px-1.5 text-caption whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('animate-spin', className)} aria-hidden />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-line-strong px-1 font-sans text-caption text-fg-subtle">{children}</kbd>
}

/** In place of the missing content: an icon (20px), what is empty, one line
 * on what belongs here, and at most one secondary action. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <div className="text-ui font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-small text-fg-subtle">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

const callouts: Record<Tone, { Icon: LucideIcon; color: string }> = {
  neutral: { Icon: Info, color: 'text-fg-muted' },
  accent: { Icon: Info, color: 'text-accent' },
  success: { Icon: CircleCheck, color: 'text-success' },
  warning: { Icon: TriangleAlert, color: 'text-warning' },
  danger: { Icon: CircleAlert, color: 'text-danger' },
}

/** A message block in place: errors, warnings, notes. The tone shows as the
 * icon alone; the block itself stays neutral. */
export function Callout({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  const { Icon, color } = callouts[tone]
  return (
    <div className={cn('flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-ui text-fg', className)}>
      <Icon size={14} className={cn('mt-0.75 shrink-0', color)} aria-hidden />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  )
}
