import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './feedback'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ink-fg hover:opacity-85',
  secondary: 'border border-line-strong bg-raised text-fg hover:bg-hover',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
}

// sm sits inside cards and rows, md is the default, lg ends dialogs and pages.
const sizes: Record<Size, string> = {
  sm: 'h-6 gap-1.5 px-2 text-small',
  md: 'h-7 gap-1.5 px-2.5 text-ui',
  lg: 'h-8 gap-1.5 px-3 text-ui',
}

const focus = 'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none'
const motion = 'transition duration-100 ease-standard'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  /** Shows a spinner and disables the button while an action runs. */
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap',
        motion,
        'disabled:pointer-events-none disabled:opacity-50',
        focus,
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip; icon buttons have no visible text. */
  label: string
  size?: Exclude<Size, 'lg'>
  active?: boolean
}

export function IconButton({ label, size = 'md', active, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg',
        'disabled:pointer-events-none disabled:opacity-50',
        motion,
        focus,
        size === 'sm' ? 'size-6' : 'size-7',
        active && 'bg-hover text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
