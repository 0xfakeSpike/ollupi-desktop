import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names; a later Tailwind utility overrides a conflicting
 * earlier one, so callers can adjust a component's defaults. */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values))
}
