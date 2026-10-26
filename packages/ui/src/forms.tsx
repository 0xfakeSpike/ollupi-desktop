import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const field =
  'w-full rounded-md border border-line-strong bg-raised px-2.5 text-sm text-fg placeholder:text-fg-subtle ' +
  'focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:opacity-60'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-8', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, 'h-8 pr-7', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'py-2 leading-5', className)} {...rest} />
}

export interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number
  ref?: Ref<HTMLTextAreaElement>
}

/** A borderless textarea that grows with its content up to maxRows
 * (CSS field-sizing, so there is no measuring). */
export function AutoTextarea({ maxRows = 12, className, style, ...rest }: AutoTextareaProps) {
  return (
    <textarea
      rows={1}
      style={{ maxHeight: `${maxRows}lh`, ...style }}
      className={cn(
        'field-sizing-content w-full resize-none bg-transparent text-sm leading-6 text-fg placeholder:text-fg-subtle focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </label>
  )
}

export interface SwitchProps {
  checked: boolean
  onChange(checked: boolean): void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50',
        'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span className={cn('size-4 rounded-full bg-white shadow transition', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  )
}
