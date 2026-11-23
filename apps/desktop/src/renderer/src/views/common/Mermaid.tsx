// A ```mermaid block drawn as its diagram, in the app's colours. The types
// beautiful-mermaid draws (flowcharts, state, sequence, class, ER and xy
// charts) it draws at once, coloured by the design tokens' CSS variables;
// a flowchart's decisions have their labels balanced over lines first. The
// rest, and any it rejects, go to mermaid with its neo look, loaded the
// first time one appears. While the block is still streaming its source is
// shown as code; a diagram neither can parse stays code, with why. Both
// escape labels (mermaid at its strict security level), so their SVG is
// safe to insert. A drawn diagram zooms in place: ⌘ with the wheel, or two
// fingers pinching, scales it about the point under the pointer, and the
// block scrolls the enlarged picture.

import { errorMessage } from '@ollupi/client'
import { Block, useTooltip } from '@ollupi/ui'
import { parseMermaid, renderMermaidSVG } from 'beautiful-mermaid'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useIsCodeFenceIncomplete } from 'streamdown'
import { useT } from '../../i18n'
import { CodeBlock, CopyButton } from './Markdown'
import { useNearViewport } from './useNearViewport'

const dark = window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (on: () => void) => {
  dark.addEventListener('change', on)
  return () => dark.removeEventListener('change', on)
}

/** A token as the opaque #rrggbb mermaid's colour maths reads. Tokens can
 * be color-mix() over other variables, so an element resolves it, and a
 * translucent one is painted over the diagram's background. */
function tokenOn(background: string): (name: string) => string {
  const probe = document.createElement('span')
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  return (name) => {
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 1, 1)
    ctx.fillStyle = resolved
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`
  }
}

/** Mermaid's base theme, from the design tokens of the scheme showing. */
function themeVariables(isDark: boolean) {
  const surface = tokenOn('#000000')('--ol-surface')
  const token = tokenOn(surface)
  const fg = token('--ol-fg')
  return {
    darkMode: isDark,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--ol-font-sans').trim(),
    fontSize: '13px',
    background: surface,
    primaryColor: token('--ol-raised'),
    primaryTextColor: fg,
    primaryBorderColor: token('--ol-line-strong'),
    secondaryColor: token('--ol-accent-soft'),
    tertiaryColor: token('--ol-canvas'),
    lineColor: token('--ol-fg-muted'),
    textColor: fg,
    noteBkgColor: token('--ol-warning-soft'),
    noteTextColor: fg,
    // Pie slices in the chart colours, parted by the surface instead of
    // outlined, their words at the interface's size.
    pie1: token('--ol-chart-1'),
    pie2: token('--ol-chart-2'),
    pie3: token('--ol-chart-3'),
    pie4: token('--ol-chart-4'),
    pieOpacity: '1',
    pieStrokeColor: surface,
    pieStrokeWidth: '2px',
    pieOuterStrokeWidth: '0px',
    pieSectionTextColor: '#ffffff',
    pieSectionTextSize: '13px',
    pieLegendTextColor: fg,
    pieLegendTextSize: '13px',
    pieTitleTextColor: fg,
    pieTitleTextSize: '13px',
  }
}

type Drawn = { svg: string } | { error: string }

const beautifulTypes = /^(flowchart|graph|stateDiagram(-v2)?|sequenceDiagram|classDiagram|erDiagram|xychart-beta)\b/

/** The line naming the diagram type: past front matter and %% comments. */
function header(code: string): string {
  const lines = code.split('\n').map((l) => l.trim())
  let i = 0
  if (lines[0] === '---') i = lines.indexOf('---', 1) + 1
  return lines.slice(i).find((l) => l && !l.startsWith('%%')) ?? ''
}

/** The tokens as CSS variables, so a scheme change recolours
 * the diagram without drawing it again. The block draws the background. */
const tokens = {
  bg: 'var(--ol-surface)',
  fg: 'var(--ol-fg)',
  line: 'var(--ol-fg-muted)',
  accent: 'var(--ol-accent)',
  muted: 'var(--ol-fg-muted)',
  surface: 'var(--ol-raised)',
  border: 'var(--ol-line-strong)',
  // Written into a quoted font-family; system-ui behind it covers Chinese.
  font: 'Inter Variable',
  transparent: true,
}

// beautiful-mermaid's node metrics: a 13px label at weight 500, lines
// 1.3 high, padded 20 across and 10 down; a decision is a square 24 wider
// than its padded label.
const label = { font: '500 13px "Inter Variable", system-ui', line: 13 * 1.3, padX: 40, padY: 20 }
let measure: CanvasRenderingContext2D | undefined
const widthOf = (text: string) => {
  measure ??= document.createElement('canvas').getContext('2d')!
  measure.font = label.font
  return measure.measureText(text).width
}
const sideOf = (lines: string[]) => Math.max(Math.max(...lines.map(widthOf)) + label.padX, lines.length * label.line + label.padY)

/** A label broken between words (a CJK word too: the segmenter finds
 * them) so no line is much wider than `width`. Punctuation stays with the
 * word before it. */
function wrap(text: string, width: number): string[] {
  const words: string[] = []
  for (const { segment, isWordLike } of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
    if (!isWordLike && words.length && segment.trim()) words[words.length - 1] += segment
    else words.push(segment)
  }
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (line.trim() && widthOf(line + w) > width) {
      lines.push(line.trim())
      line = w.trimStart()
    } else line += w
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

/** The label in at most `n` lines of even length: wrapped at the
 * narrowest width that still needs no more, so the last line is not left
 * with a word or two. */
function balanced(text: string, whole: number, n: number): string[] {
  let [lo, hi] = [whole / n, whole]
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    if (wrap(text, mid).length <= n) hi = mid
    else lo = mid
  }
  return wrap(text, hi)
}

/** The source with each one-line decision label broken into the lines
 * that make its square smallest: written on one line, a question's width
 * sets the side, and the diamond towers over the steps around it. A
 * label the author broke, or formatted, is left as written. */
function balanceDecisions(code: string): string {
  for (const node of parseMermaid(code).nodes.values()) {
    if (node.shape !== 'diamond' || /[\n<*~]/.test(node.label)) continue
    const whole = widthOf(node.label)
    const tried = [[node.label]]
    for (let n = 2; n * label.line + label.padY < whole + label.padX; n++) tried.push(balanced(node.label, whole, n))
    // The fewest lines within a little of the smallest square: more, each
    // a word or two, save hardly any room and read as a column.
    const smallest = Math.min(...tried.map(sideOf))
    const best = tried.find((lines) => sideOf(lines) <= smallest * 1.2)!
    if (best.length === 1) continue
    // The parser's own pattern for a node written as id{label}; ids are
    // word characters and hyphens, so need no escaping.
    code = code.replace(new RegExp(`(?<![\\w-])(${node.id}\\{)(?!\\{)("?)(.+?)\\2\\}`), (_, open, quote) => `${open}${quote}${best.join('<br>')}${quote}}`)
  }
  return code
}

/** beautiful-mermaid's SVG, or undefined for a type it does not draw or a
 * diagram it rejects. Its stylesheet imports its fonts from Google; the
 * app's own fonts are already there, so that request is dropped. */
function beautiful(code: string): string | undefined {
  if (!beautifulTypes.test(header(code))) return undefined
  try {
    return renderMermaidSVG(balanceDecisions(code), tokens).replace(/@import url\([^)]*\);?/g, '')
  } catch {
    return undefined
  }
}

export function MermaidBlock({ code }: { code: string }) {
  const streaming = useIsCodeFenceIncomplete()
  const isDark = useSyncExternalStore(subscribe, () => dark.matches)
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`
  const [drawn, setDrawn] = useState<Drawn>()
  const m = useT().conversation.markdown
  // A diagram is drawn for the screen, so it waits for its block to come
  // near the viewport, as a code block's highlighting does.
  const { ref, near } = useNearViewport<HTMLDivElement>()
  const fast = useMemo(() => (streaming || !near ? undefined : beautiful(code)), [code, streaming, near])

  useEffect(() => {
    if (streaming || !near || fast) return
    let current = true
    void import('mermaid').then(async ({ default: mermaid }) => {
      // Drawn at their own size, so labels stay at the interface's 13px:
      // scaled to the column, a wide chart's text would shrink and a narrow
      // one's grow.
      const natural = { useMaxWidth: false }
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        // A diagram it cannot parse throws, instead of leaving its error
        // drawing in the page.
        suppressErrorRendering: true,
        theme: 'base',
        look: 'neo',
        // Diagrams such as sequence copy this over their own font sizes.
        fontSize: 13,
        themeVariables: themeVariables(isDark),
        flowchart: natural,
        sequence: natural,
        class: natural,
        state: natural,
        er: natural,
        gantt: natural,
        journey: natural,
        pie: natural,
        mindmap: natural,
      })
      try {
        const { svg } = await mermaid.render(id, code)
        if (current) setDrawn({ svg })
      } catch (err) {
        if (current) setDrawn({ error: errorMessage(err) })
      }
    })
    return () => {
      current = false
    }
  }, [code, streaming, fast, isDark, id, near])

  const content = fast ? (
    <Diagram code={code} svg={fast} />
  ) : streaming || !near || !drawn ? (
    <CodeBlock code={code} label="mermaid" />
  ) : 'error' in drawn ? (
    <div className="flex flex-col gap-1.5">
      <CodeBlock code={code} label="mermaid" />
      <p className="selectable text-small text-danger">{m.diagramError(drawn.error.split('\n')[0]!)}</p>
    </div>
  ) : (
    <Diagram code={code} svg={drawn.svg} />
  )
  return <div ref={ref}>{content}</div>
}

// How far a diagram may be scaled from its own size.
const least = 0.5
const most = 4

/** The diagram's scale, and the way back to 100%. Always shown, also at
 * 100%: it is how one finds out the picture can be scaled at all. */
function ScaleReadout({ scale, onReset }: { scale: number; onReset: () => void }) {
  const m = useT().conversation.markdown
  const { trigger, tooltip } = useTooltip({ label: m.scaleReset, hint: m.scaleHint })
  return (
    <>
      <button
        type="button"
        aria-label={m.scaleReset}
        className="h-5 shrink-0 rounded-full px-2 text-caption font-semibold text-fg-muted tabular-nums transition duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        onClick={onReset}
        {...trigger}
      >
        {Math.round(scale * 100)}%
      </button>
      {tooltip}
    </>
  )
}

/** The picture at its own size, or scaled: it is the SVG's width and height
 * that change, not a transform, so its lines stay sharp and the block's own
 * scrollbars reach all of it. The scale is written to the SVG by hand: a
 * new drawing replaces the element, and the effect below settles it back. */
function Diagram({ code, svg }: { code: string; svg: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const natural = useRef<{ width: number; height: number } | null>(null)
  const scale = useRef(1)
  const [shown, setShown] = useState(1)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  /** Draws the diagram `next` times its own size, keeping the point at `at`
   * (in the window) where it is under the pointer; without one, the middle
   * of what is in view. */
  const paint = useCallback((next: number, at?: { x: number; y: number }) => {
    const box = frame.current
    const el = box?.firstElementChild as SVGSVGElement | null
    const size = natural.current
    if (!box || !el || !size) return
    const rect = box.getBoundingClientRect()
    const was = el.getBoundingClientRect()
    if (!was.width || !was.height) return
    // The point under the pointer as a fraction of the picture, so the
    // picture's own edges (and the margins centring a small one) do not
    // enter the arithmetic.
    const fx = at ? (at.x - was.left) / was.width : 0.5
    const fy = at ? (at.y - was.top) / was.height : 0.5
    el.style.width = `${size.width * next}px`
    el.style.height = `${size.height * next}px`
    const now = el.getBoundingClientRect()
    box.scrollLeft = now.left - rect.left + box.scrollLeft + fx * now.width - (at ? at.x - rect.left : box.clientWidth / 2)
    box.scrollTop = now.top - rect.top + box.scrollTop + fy * now.height - (at ? at.y - rect.top : box.clientHeight / 2)
    scale.current = next
    setShown(next)
  }, [])

  const reset = useCallback(() => {
    const box = frame.current
    const el = box?.firstElementChild as SVGSVGElement | null
    if (el) {
      el.style.width = ''
      el.style.height = ''
    }
    box?.scrollTo(0, 0)
    scale.current = 1
    setShown(1)
  }, [])

  // A new drawing is measured before it is sized again: the other scheme's
  // colours redraw the same picture, and the scale it had is kept.
  useEffect(() => {
    const box = frame.current
    const el = box?.firstElementChild as SVGSVGElement | null
    if (!el) return
    el.style.width = ''
    el.style.height = ''
    const rect = el.getBoundingClientRect()
    natural.current = { width: rect.width, height: rect.height }
    if (scale.current !== 1) paint(scale.current)
  }, [svg, paint])

  // ⌘ with the wheel and a trackpad's pinch both arrive as a wheel with
  // ctrlKey set. A plain wheel is the page's and is left alone: an in-place
  // zoom must not swallow scrolling.
  useEffect(() => {
    const box = frame.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.clientHeight : 1
      const next = Math.min(most, Math.max(least, scale.current * Math.exp(-e.deltaY * unit * 0.002)))
      if (next !== scale.current) paint(next, { x: e.clientX, y: e.clientY })
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [paint])

  const zoomed = shown !== 1
  return (
    <Block label={<span className="font-mono">mermaid</span>} actions={<><ScaleReadout scale={shown} onReset={reset} /><CopyButton text={code} /></>}>
      <div
        ref={frame}
        className={zoomed ? 'mermaid-diagram cursor-grab overflow-auto select-none active:cursor-grabbing' : 'mermaid-diagram overflow-x-auto'}
        style={zoomed ? { maxHeight: '70vh' } : undefined}
        onDoubleClick={reset}
        // Only a scaled picture pans by dragging; at its own size the words
        // in it still select as text.
        onPointerDown={(e) => {
          const box = frame.current
          if (!zoomed || e.button !== 0 || !box) return
          drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop }
          e.currentTarget.setPointerCapture(e.pointerId)
          e.preventDefault()
        }}
        onPointerMove={(e) => {
          const box = frame.current
          const from = drag.current
          if (!box || !from) return
          box.scrollLeft = from.left - (e.clientX - from.x)
          box.scrollTop = from.top - (e.clientY - from.y)
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Block>
  )
}
