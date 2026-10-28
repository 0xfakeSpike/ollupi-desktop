// A ```mermaid block drawn as its diagram, in the app's palette. Mermaid is
// loaded the first time a diagram appears. While the block is still
// streaming its source is shown as code; a diagram mermaid cannot parse
// stays code, with why. Mermaid's strict security level sanitizes labels,
// so its SVG is safe to insert.

import { Block } from '@ollupi/ui'
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
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
  }
}

type Drawn = { svg: string } | { error: string }

export function MermaidBlock({ code }: { code: string }) {
  const streaming = useIsCodeFenceIncomplete()
  const palette = useAppearance((s) => s.palette)
  const isDark = useSyncExternalStore(subscribe, () => dark.matches)
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`
  const [drawn, setDrawn] = useState<Drawn>()
  const m = useT().conversation.markdown

  useEffect(() => {
    if (streaming) return
    let current = true
    void import('mermaid').then(async ({ default: mermaid }) => {
      // Drawn at their own size, so labels stay at the interface's 13px:
      // scaled to the column, a wide chart's text would shrink and a narrow
      // one's grow.
      const natural = { useMaxWidth: false }
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
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
  }, [code, streaming, isDark, palette, id])

  if (streaming || !drawn) return <CodeBlock code={code} label="mermaid" />
  if ('error' in drawn) {
    return (
      <div className="flex flex-col gap-1.5">
        <CodeBlock code={code} label="mermaid" />
        <p className="selectable text-small text-danger">{m.diagramError(drawn.error.split('\n')[0]!)}</p>
      </div>
    )
  }
  return (
    <Block label={<span className="font-mono">mermaid</span>} actions={<CopyButton text={code} />}>
      <div className="mermaid-diagram overflow-x-auto" dangerouslySetInnerHTML={{ __html: drawn.svg }} />
    </Block>
  )
}
