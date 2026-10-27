import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// theme.css names its own scales; without them tailwind-merge would read
// text-ui as a text colour and drop it beside text-fg.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'small', 'ui', 'body', 'title', 'display'],
      ease: ['standard'],
      animate: ['enter', 'dialog', 'fade'],
      container: ['thread', 'dialog', 'dialog-wide'],
    },
  },
})

/** Joins class names; a later Tailwind utility overrides a conflicting
 * earlier one, so callers can adjust a component's defaults. */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values))
}
