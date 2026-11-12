import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn'
import { Spinner } from './feedback'
import { useTooltip } from './tooltip'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ink-fg hover:opacity-90',
  secondary: 'bg-surface text-fg hover:bg-hover',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
}

// Every button is a capsule (DESIGN.md §0, stone and moss). sm sits inside
// rows, md is the default, lg answers a card or ends a dialog.
const sizes: Record<Size, string> = {
  sm: 'h-6 gap-1.5 px-2.5 text-small',
  md: 'h-8 gap-1.5 px-3.5 text-ui',
  lg: 'h-10 gap-2 px-4.5 text-ui',
}

const focus = 'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none'
const motion = 'transition duration-100 ease-standard'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  /** Shows a spinner and disables the button while an action runs. */
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap',
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
  /** A line in the tooltip under the label, on what the action does. */
  hint?: string
  size?: Exclude<Size, 'lg'>
  /** A toggle that is on, such as the button of an open panel: drawn as selected and announced as pressed. */
  active?: boolean
}

export function IconButton({ label, hint, size = 'md', active, className, children, type = 'button', ...rest }: IconButtonProps) {
  const { trigger, tooltip } = useTooltip({ label, hint })
  return (
    <>
      <button
        type={type}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg',
          'disabled:pointer-events-none disabled:opacity-50',
          motion,
          focus,
          size === 'sm' ? 'size-6' : 'size-7',
          active && 'bg-selected text-fg hover:bg-selected',
          className,
        )}
        {...rest}
        {...trigger}
      >
        {children}
      </button>
      {tooltip}
    </>
  )
}
