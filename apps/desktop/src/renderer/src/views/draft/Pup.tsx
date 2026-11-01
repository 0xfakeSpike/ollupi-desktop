// The wolf pup from ollupi's logo, sitting on the draft's message box. It
// rises from behind the box as the screen opens and looks at you; now and
// then it blinks, looks left and right, or says something. A timer moves it
// from one pose to the next, so nothing animates in between.

import { useEffect, useRef } from 'react'
import mark from '../../../../../../../docs/logo/mark.svg?url'

/** The logo's 12-unit pixels: its rows start 6 units down. */
const PX = 12
const TOP = 6

const COLORS: Record<string, string> = { '#': '#1e1b4b', b: '#a5b4fc', w: '#eef2ff', W: '#ffffff' }

/** The pup sits behind the logo's head, which covers its top rows. */
const BODY_ROW = 15
const BODY = [
  '..#bbbbbbbbbbbbbb#..',
  '.#bbbbbbbbbbbbbbbb#.',
  '.#bbbbbwwwwwwbbbbb#.',
  '#bbbbbwwwwwwwwbbbbb#',
  '#bbbbwwwwwwwwwwbbbb#',
  '#bbb#wwwwwwwwww#bbb#',
  '#bbb#wwwwwwwwww#bbb#',
  '#bbb#wwwwwwwwww#bbb#',
  '#bbbwwwww##wwwwwbbb#',
  '.###wwwww##wwwww###.',
  '...##############...',
]
const HEIGHT = TOP + PX * (BODY_ROW + BODY.length)

/** Each eye is drawn over the 4 by 3 pixels around it, from row 7: the left
 * one from column 4, the right one from column 12. Looking ahead is the
 * logo's own eyes; looking aside also turns the head a pixel that way. */
const EYE_ROW = 7
const EYE_COLUMNS = [4, 12]
const EYES = {
  left: ['W#bb', '##bb', '##ww'],
  right: ['bbW#', 'bb##', 'ww##'],
  shut: ['bbbb', 'bbbb', 'w##w'],
}
type Eyes = keyof typeof EYES | 'ahead'

/** The mouth is shut in a smile, drawn over the logo's open one from row 13,
 * column 6; opening it shows the logo's. */
const MOUTH_ROW = 13
const MOUTH_COLUMN = 6
const SHUT_MOUTH = ['w#w##w#w', 'ww#ww#ww', 'wwwwwwww', 'wwwwwwww']

/** A pose held for some milliseconds; it looks ahead with its mouth shut
 * unless the pose says otherwise. */
type Step = [{ eyes?: Eyes; mouth?: 'shut' | 'open' }, number]

/** What the pup does between spells of looking at you. */
const BLINK: Step[] = [[{ eyes: 'shut' }, 130]]
const LOOK_AROUND: Step[] = [
  [{ eyes: 'left' }, 900],
  [{}, 250],
  [{ eyes: 'right' }, 900],
]
const HABITS: Step[][] = [
  BLINK,
  BLINK,
  [
    [{ eyes: 'shut' }, 120],
    [{}, 120],
    [{ eyes: 'shut' }, 120],
  ],
  LOOK_AROUND,
  // Says something.
  [
    [{ mouth: 'open' }, 180],
    [{}, 120],
    [{ mouth: 'open' }, 180],
    [{}, 120],
    [{ mouth: 'open' }, 260],
  ],
]

/** Milliseconds it looks at you between habits: at least the first, up to both. */
const AHEAD = [2500, 6000] as const

export function Pup() {
  const sprite = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer: number
    const pose = ({ eyes = 'ahead', mouth = 'shut' }: Step[0]) => {
      sprite.current?.setAttribute('data-eyes', eyes)
      sprite.current?.setAttribute('data-mouth', mouth)
    }
    // Settles first, then looks around; after that, a habit at random.
    const play = (steps: Step[], i = 0) => {
      const step = steps[i]
      if (!step) {
        pose({})
        timer = window.setTimeout(() => {
          play(document.hidden ? [] : HABITS[Math.floor(Math.random() * HABITS.length)]!)
        }, AHEAD[0] + Math.random() * (AHEAD[1] - AHEAD[0]))
        return
      }
      pose(step[0])
      timer = window.setTimeout(() => play(steps, i + 1), step[1])
    }
    timer = window.setTimeout(() => play(LOOK_AROUND), 1500)
    return () => clearTimeout(timer)
  }, [])
  // 2px to each of the pup's pixels; its bottom outline stays behind the box's border.
  return (
    <svg
      ref={sprite}
      data-eyes="ahead"
      data-mouth="shut"
      viewBox={`0 0 240 ${HEIGHT}`}
      width={40}
      height={HEIGHT / 6}
      shapeRendering="crispEdges"
      className="pup peek -mb-0.5 block"
    >
      {pixels(BODY, BODY_ROW, 0)}
      <g data-head>
        <image href={mark} width={240} height={240} />
        <g data-shut-mouth>{pixels(SHUT_MOUTH, MOUTH_ROW, MOUTH_COLUMN)}</g>
        {(Object.keys(EYES) as (keyof typeof EYES)[]).map((eyes) => (
          <g key={eyes} data-look={eyes}>
            {EYE_COLUMNS.map((column) => pixels(EYES[eyes], EYE_ROW, column))}
          </g>
        ))}
      </g>
    </svg>
  )
}

/** Rows of pixel art as rects, one per run of a colour; '.' is see-through. */
function pixels(rows: string[], row: number, column: number) {
  return rows.flatMap((line, r) =>
    [...line.matchAll(/([^.])\1*/g)].map((run) => (
      <rect
        key={`${column}-${row + r}-${run.index}`}
        x={(column + run.index!) * PX}
        y={TOP + (row + r) * PX}
        width={run[0].length * PX}
        height={PX}
        fill={COLORS[run[1]!]}
      />
    )),
  )
}
