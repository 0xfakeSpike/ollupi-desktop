import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './primitives'

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

export interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number
  ref?: Ref<HTMLTextAreaElement>
}

/** A textarea that grows with its content up to maxRows (CSS field-sizing). */
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

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </label>
  )
}
