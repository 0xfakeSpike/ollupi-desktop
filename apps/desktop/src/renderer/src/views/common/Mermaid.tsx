// A ```mermaid block drawn as its diagram, in the app's palette. The types
// beautiful-mermaid draws (flowcharts, state, sequence, class, ER and xy
// charts) it draws at once, coloured by the design tokens' CSS variables;
// a flowchart's decisions have their labels balanced over lines first. The
// rest, and any it rejects, go to mermaid with its neo look, loaded the
// first time one appears. While the block is still streaming its source is
// shown as code; a diagram neither can parse stays code, with why. Both
// escape labels (mermaid at its strict security level), so their SVG is
// safe to insert.

import { Block } from '@ollupi/ui'
import { parseMermaid, renderMermaidSVG } from 'beautiful-mermaid'
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { useIsCodeFenceIncomplete } from 'streamdown'
import { useAppearance } from '../../domains/appearance'
import { useT } from '../../i18n'
import { CodeBlock, CopyButton } from './Markdown'

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

/** Mermaid's base theme, from the design tokens of the palette showing. */
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

/** The tokens as CSS variables, so a palette or scheme change recolours
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
  const palette = useAppearance((s) => s.palette)
  const isDark = useSyncExternalStore(subscribe, () => dark.matches)
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`
  const [drawn, setDrawn] = useState<Drawn>()
  const m = useT().conversation.markdown
  const fast = useMemo(() => (streaming ? undefined : beautiful(code)), [code, streaming])

  useEffect(() => {
    if (streaming || fast) return
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
        if (current) setDrawn({ error: err instanceof Error ? err.message : String(err) })
      }
    })
    return () => {
      current = false
    }
  }, [code, streaming, fast, isDark, palette, id])

  if (fast) return <Diagram code={code} svg={fast} />
  if (streaming || !drawn) return <CodeBlock code={code} label="mermaid" />
  if ('error' in drawn) {
    return (
      <div className="flex flex-col gap-1.5">
        <CodeBlock code={code} label="mermaid" />
        <p className="selectable text-small text-danger">{m.diagramError(drawn.error.split('\n')[0]!)}</p>
      </div>
    )
  }
  return <Diagram code={code} svg={drawn.svg} />
}

function Diagram({ code, svg }: { code: string; svg: string }) {
  return (
    <Block label={<span className="font-mono">mermaid</span>} actions={<CopyButton text={code} />}>
      <div className="mermaid-diagram overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </Block>
  )
}
