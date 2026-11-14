// The little wolf, for the app's quiet moments only (DESIGN.md 0.4): empty
// states and first use, never in the flow, the approval card, the status
// line or anything repeated. A pose is one colour, the colour of the text
// around it, cut out in the ground it sits on; under the dusk theme a little
// grass and a firefly sit at its feet. The emblem is the brand's own, oat or,
// under dusk, the wolf in a dusk sky. The savanna's other accents, the horizon
// and the dragonfly, belong to the dusk theme alone. Decorative: hidden from
// screen readers, they say nothing the words beside them do not.

import type { CSSProperties } from 'react'
import { useAppearance } from '../../domains/appearance'
import { DRAGONFLY, EMBLEM, EMBLEM_DUSK, HORIZON, POSE_GRASS, POSES } from './wolfArt'

export type WolfPose = keyof typeof POSES

const useDusk = () => useAppearance((s) => s.theme === 'dusk')

export function Wolf({ pose, className, ground = 'var(--color-canvas)' }: { pose: WolfPose; className?: string; ground?: string }) {
  const dusk = useDusk()
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      fill="currentColor"
      overflow="visible"
      className={className}
      style={{ '--cut': ground } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: POSES[pose] + (dusk ? POSE_GRASS : '') }}
    />
  )
}

/** The round emblem in its theme's colours. */
export function Emblem({ className }: { className?: string }) {
  const dusk = useDusk()
  return <svg aria-hidden viewBox="0 0 100 100" className={className} dangerouslySetInnerHTML={{ __html: dusk ? EMBLEM_DUSK : EMBLEM }} />
}

/** A small savanna horizon for an empty page, under dusk only. */
export function Horizon({ className }: { className?: string }) {
  if (!useDusk()) return null
  return <svg aria-hidden viewBox="0 0 420 120" className={className} dangerouslySetInnerHTML={{ __html: HORIZON }} />
}

/** A dragonfly for the sidebar's empty top row, under dusk only. */
export function Dragonfly({ className }: { className?: string }) {
  if (!useDusk()) return null
  return <svg aria-hidden viewBox="-40 -30 80 70" className={className} dangerouslySetInnerHTML={{ __html: DRAGONFLY }} />
}
