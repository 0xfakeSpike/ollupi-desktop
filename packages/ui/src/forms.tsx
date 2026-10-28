import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

// Transparent, so a field takes the surface it sits on (canvas on a page,
// raised in a dialog). Inside an invalid Field the border turns danger.
const field =
  'w-full rounded-md border border-line-strong bg-transparent px-2.5 text-ui text-fg placeholder:text-fg-subtle ' +
  'focus:border-accent focus:ring-3 focus:ring-focus focus:outline-none disabled:opacity-50 ' +
  'group-data-invalid/field:border-danger'

/** md beside other controls; lg in dialogs, matching their lg buttons. */
type FieldSize = 'md' | 'lg'
const heights: Record<FieldSize, string> = { md: 'h-7', lg: 'h-8' }

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize
}

export function Input({ size = 'md', className, ...rest }: InputProps) {
  return <input className={cn(field, heights[size], className)} {...rest} />
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: FieldSize
}

export function Select({ size = 'md', className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(field, heights[size], 'pr-7', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'py-1.5', className)} {...rest} />
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
        'field-sizing-content w-full resize-none bg-transparent text-body text-fg placeholder:text-fg-subtle focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
}

export interface FieldProps {
  label: string
  hint?: ReactNode
  /** Replaces the hint and marks the control invalid. */
  error?: ReactNode
  children: ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="group/field flex flex-col gap-1.5" data-invalid={error ? '' : undefined}>
      <span className="text-ui font-medium text-fg">{label}</span>
      <span className="flex flex-col gap-1">
        {children}
        {error ? <span className="text-small text-danger">{error}</span> : hint && <span className="text-small text-fg-subtle">{hint}</span>}
      </span>
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
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition duration-160 ease-standard disabled:opacity-50',
        'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span className={cn('size-4 rounded-full bg-knob shadow-sm transition duration-160 ease-standard', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  )
}

export interface CheckboxProps {
  checked: boolean
  onChange(checked: boolean): void
  /** Beside the box; a click on it toggles too. */
  children: ReactNode
  disabled?: boolean
  className?: string
}

/** For a form saved as a whole; a setting that applies at once is a Switch. */
export function Checkbox({ checked, onChange, children, disabled, className }: CheckboxProps) {
  return (
    <label className={cn('flex min-w-0 items-center gap-2 text-ui text-fg has-disabled:opacity-50', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 shrink-0 accent-accent focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      />
      {children}
    </label>
  )
}
