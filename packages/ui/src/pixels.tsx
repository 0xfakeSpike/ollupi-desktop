// The pixel pieces of 格墨 (design-guidelines 0.3): the wolf pup, the
// loader and the send arrow. Pixels move on a beat, a frame at a time, and
// never in between; under reduced motion they hold still.

import { useEffect, useState } from 'react'
import { cn } from './cn'

/** The pup's 20 by 20 grid: its five colours, the tongue and the eyes' shine.
 * They are the brand's, the same in light and dark. */
const COLORS: Record<string, string> = {
  N: '#1b1838',
  L: '#aeb5f5',
  S: '#eff0fb',
  P: '#f4aacb',
  T: '#ee6e8a',
  W: '#ffffff',
}

const TOP = [
  '...N............N...',
  '..NLN..........NLN..',
  '..NLLN........NLLN..',
  '..NLPLN......NLPLN..',
  '..NLPPLNNNNNNLPPLN..',
  '.NLLPPLLLLLLLLPPLLN.',
  '.NLLLLLLLSSLLLLLLLN.',
]
const EYES = {
  open: ['.NLLLWNLLSSLLWNLLLN.', 'NLLLLNNLSSSSLNNLLLLN', 'NLSSSNNSSSSSSNNSSSLN'],
  closed: ['.NLLLLLLLSSLLLLLLLN.', 'NLLLLLLLSSSSLLLLLLLN', 'NLSSSNNSSSSSSNNSSSLN'],
  left: ['.NLLWNLLLSSLWNLLLLN.', 'NLLLNNLLSSSSNNLLLLLN', 'NLSSNNSSSSSSNNSSSSLN'],
  right: ['.NLLLLWNLSSLLLWNLLN.', 'NLLLLLNNSSSSLLNNLLLN', 'NLSSSSNNSSSSSSNNSSLN'],
}
const NOSE = ['NSPPSSSSNNNNSSSSPPSN', '.NSSSSSSSNNSSSSSSSN.']
const MOUTHS = {
  smile: ['NSSSSSSSSSSSSSSSSSSN', '.NSSSSSNSNNSNSSSSSN.', '..NSSSSSNSSNSSSSSN..', '...NSSSSSSSSSSSSN...'],
  oh: ['NSSSSSSSSSSSSSSSSSSN', '.NSSSSSSSNNSSSSSSSN.', '..NSSSSSNTTNSSSSSN..', '...NSSSSNTTNSSSSN...'],
  grin: ['NSSSSSNSSSSSSNSSSSSN', '.NSSSSSNNNNNNSSSSSN.', '..NSSSSSNTTNSSSSSN..', '...NSSSSSNNSSSSSN...'],
}
const CHIN = ['....NNSSSSSSSSNN....', '......NNSSSSNN......', '........NNNN........']

/** Each face stands for one state, and the product shows no others. */
const FACES = {
  smile: ['open', 'smile'],
  oh: ['open', 'oh'],
  blink: ['closed', 'smile'],
  'look-left': ['left', 'smile'],
  'look-right': ['right', 'smile'],
  grin: ['open', 'grin'],
} as const satisfies Record<string, [keyof typeof EYES, keyof typeof MOUTHS]>

export type PupFace = keyof typeof FACES

/** Each face as runs of one colour on a row, drawn once. */
const RUNS = Object.fromEntries(
  Object.entries(FACES).map(([face, [eyes, mouth]]) => {
    const rows = [...TOP, ...EYES[eyes], ...NOSE, ...MOUTHS[mouth], ...CHIN]
    const runs = rows.flatMap((row, y) =>
      [...row.matchAll(/([^.])\1*/g)].map((run) => ({ x: run.index, y, w: run[0].length, fill: COLORS[run[1]!]! })),
    )
    return [face, runs]
  }),
) as Record<PupFace, { x: number; y: number; w: number; fill: string }[]>

/** The faces a motion steps through, one a beat. Thinking looks left and
 * right and now and then blinks; idling smiles and blinks every 3 seconds. */
const MOTIONS = {
  think: {
    beat: 420,
    faces: ['look-left', 'look-left', 'look-left', 'look-right', 'look-right', 'look-right', 'blink', 'look-left', 'look-left', 'look-right', 'look-right', 'look-right'],
  },
  idle: { beat: 420, faces: ['smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'blink'] },
} as const satisfies Record<string, { beat: number; faces: PupFace[] }>

export type PupMotion = keyof typeof MOTIONS

/** The pixel wolf pup. Its size is a multiple of 20, so every grid cell
 * lands on whole pixels (16 is for favicons and notifications only). With a
 * motion it steps through that motion's faces; still, or under reduced
 * motion, it shows `face`. Decorative unless it has a label. */
export function Pup({
  face = 'smile',
  motion,
  size = 20,
  label,
  className,
}: {
  face?: PupFace
  motion?: PupMotion
  size?: 20 | 40 | 60 | 120 | 240
  label?: string
  className?: string
}) {
  const beat = useBeat(motion && MOTIONS[motion].beat)
  const shown = motion && beat !== undefined ? MOTIONS[motion].faces[beat % MOTIONS[motion].faces.length]! : face
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {RUNS[shown].map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}

/** A counter that goes up every `ms`, or undefined when nothing should move:
 * no interval, or the person asked for reduced motion. */
function useBeat(ms: number | undefined): number | undefined {
  const [beat, setBeat] = useState<number>()
  useEffect(() => {
    if (!ms || matchMedia('(prefers-reduced-motion: reduce)').matches) return setBeat(undefined)
    setBeat(0)
    const timer = setInterval(() => setBeat((b) => (b ?? 0) + 1), ms)
    return () => clearInterval(timer)
  }, [ms])
  return beat
}

/** Waiting on something that takes a while: three square pixels light in
 * turn, 300ms a beat, then a beat of rest. It shows only after 300ms, so a
 * quick load shows nothing. The label is the verb ("Loading models…"). */
export function PixelLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('pixel-loader flex items-center gap-2 text-ui text-fg-muted', className)}>
      <span aria-hidden className="flex gap-1">
        <span className="size-1.5" />
        <span className="size-1.5" />
        <span className="size-1.5" />
      </span>
      {label}
    </div>
  )
}

const ARROW = ['...#...', '..###..', '.#.#.#.', '#..#..#', '...#...', '...#...', '...#...']

/** The send button's arrow, 7 by 7 pixels in the text colour: the one
 * pixel icon in the interface; every other icon is lucide. */
export function PixelArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 7 7" width={14} height={14} shapeRendering="crispEdges" fill="currentColor" aria-hidden className={cn('shrink-0', className)}>
      {ARROW.flatMap((row, y) => [...row.matchAll(/#+/g)].map((run) => <rect key={`${run.index}-${y}`} x={run.index} y={y} width={run[0].length} height={1} />))}
    </svg>
  )
}
