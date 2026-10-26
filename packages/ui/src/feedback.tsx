import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-hover text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('animate-spin', className)} aria-hidden />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong px-1 font-sans text-[10px] leading-4 text-fg-subtle">{children}</kbd>
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-sm text-fg-muted">{children}</div>}
      {action}
    </div>
  )
}

/** A bordered message block: errors, warnings, notes. */
export function Callout({ tone = 'neutral', icon, className, children }: { tone?: Tone; icon?: ReactNode; className?: string; children: ReactNode }) {
  const border: Record<Tone, string> = {
    neutral: 'border-line',
    accent: 'border-accent/30',
    success: 'border-success/30',
    warning: 'border-warning/40',
    danger: 'border-danger/30',
  }
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]', border[tone], tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  )
}
