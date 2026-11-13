// The little wolf, for the app's quiet moments only (DESIGN.md 0.4): empty
// states and first use, never in the flow, the approval card, the status
// line or anything repeated. A pose is one colour, the colour of the text
// around it, cut out in the ground it sits on; the emblem is the brand's own
// night and moon. Decorative: hidden from screen readers, it says nothing
// the words beside it do not.

import type { CSSProperties } from 'react'
import { EMBLEM, POSES } from './wolfArt'

export type WolfPose = keyof typeof POSES

export function Wolf({ pose, className, ground = 'var(--color-canvas)' }: { pose: WolfPose; className?: string; ground?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      style={{ '--cut': ground } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: POSES[pose] }}
    />
  )
}

/** The round emblem: the night, the moon and the wolf in their own colours. */
export function Emblem({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 100 100" className={className} dangerouslySetInnerHTML={{ __html: EMBLEM }} />
}
