// The person's own shell in the workspace's folder, beside the conversation.
// One per workspace: threads of a workspace share it, and it keeps running
// while the panel is closed, showing what it printed meanwhile when it opens
// again. It is not the agent's: nothing typed here goes through ollupi.

import type { WorkspaceRow } from '@ollupi/protocol'
import { IconButton } from '@ollupi/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppearance } from '../../domains/appearance'
import { run } from '../../gateway/run'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'
import { SidePanel } from './SidePanel'

export function TerminalPanel({ workspace }: { workspace: WorkspaceRow }) {
  const t = useT().conversation.terminal
  const host = useRef<HTMLDivElement>(null)
  // A new shell replaces the one running when this changes.
  const [restarts, setRestarts] = useState(0)
  const appearance = useAppearance()
  const key = workspace.id
  const cwd = workspace.rootPath

  useEffect(() => {
    const el = host.current
    if (!el) return
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const theme = () => {
      const css = getComputedStyle(document.documentElement)
      const color = (name: string) => css.getPropertyValue(name).trim()
      return {
        background: color('--color-canvas'),
        foreground: color('--color-fg'),
        cursor: color('--color-fg'),
        selectionBackground: color('--color-selected'),
        ...(dark.matches ? ansiDark : ansiLight),
      }
    }
    const term = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim(),
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      theme: theme(),
    })
    // The page's colours follow the system as it changes; the terminal's
    // were read once, so they are read again.
    const recolor = () => (term.options.theme = theme())
    dark.addEventListener('change', recolor)
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    // What the shell printed before open answered is in its answer; only
    // what follows is drawn as it comes.
    let ready = false
    const offData = desktop.terminal.onData((k, text) => ready && k === key && term.write(text))
    const offExit = desktop.terminal.onExit((k) => k === key && term.write(`\r\n${t.exited}\r\n`))
    let live = true
    void run((e) => e.terminal, () => desktop.terminal.open(key, cwd, term.cols, term.rows)).then((past) => {
      if (!live) return
      ready = true
      if (past) term.write(past)
    })
    const input = term.onData((text) => void desktop.terminal.write(key, text))
    const resized = term.onResize(({ cols, rows }) => void desktop.terminal.resize(key, cols, rows))
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(el)
    term.focus()
    return () => {
      live = false
      dark.removeEventListener('change', recolor)
      observer.disconnect()
      input.dispose()
      resized.dispose()
      offData()
      offExit()
      term.dispose()
    }
  }, [key, cwd, restarts, appearance.scheme, t.exited])

  return (
    <SidePanel
      panel="terminal"
      width="half"
      title={t.title}
      closeLabel={t.close}
      bare
      actions={
        <IconButton
          label={t.restart}
          size="sm"
          onClick={() => {
            void desktop.terminal.close(key).then(() => setRestarts((n) => n + 1))
          }}
        >
          <RotateCcw size={14} />
        </IconButton>
      }
    >
      <div ref={host} className="min-h-0 flex-1 bg-canvas px-2 py-1" />
    </SidePanel>
  )
}

// The 16 colours a shell prints in, one set per scheme: xterm's own are made
// for a dark ground and wash out on paper. Each reads at 4.5:1 or more on its
// scheme's canvas (#f8f7f4, #1d201f); red is the danger hue, so a prompt in
// red still reads as the shell's colour, not as ochre's "needs you".
const ansiLight = {
  black: '#22252a',
  red: '#a3264a',
  green: '#35652d',
  yellow: '#755600',
  blue: '#2c5a87',
  magenta: '#7a3f86',
  cyan: '#1f6668',
  white: '#4c5057',
  brightBlack: '#5b5f66',
  brightRed: '#a3264a',
  brightGreen: '#35652d',
  brightYellow: '#755600',
  brightBlue: '#2c5a87',
  brightMagenta: '#7a3f86',
  brightCyan: '#1f6668',
  brightWhite: '#22252a',
}
const ansiDark = {
  black: '#5b605c',
  red: '#f08aa6',
  green: '#9fcf8f',
  yellow: '#e3c27a',
  blue: '#8fb4e0',
  magenta: '#d3a2e0',
  cyan: '#7fcfcf',
  white: '#d5d8d2',
  brightBlack: '#8e948c',
  brightRed: '#f5a3b9',
  brightGreen: '#b5dca8',
  brightYellow: '#ecd197',
  brightBlue: '#a9c5e8',
  brightMagenta: '#ddb6e8',
  brightCyan: '#9cdada',
  brightWhite: '#ecedea',
}
