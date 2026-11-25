// The person's own shell in the workspace's folder, beside the conversation,
// run where the workspace is, which may be another machine than the
// window's: ollupi starts it there and streams it here. One per workspace:
// threads of a workspace share it, and it keeps running while the panel is
// closed, or the window, showing what it printed meanwhile when it opens
// again. It is the person's, not the agent's: it runs with full access and
// asks nothing.

import type { WorkspaceRow } from '@ollupi/protocol'
import { IconButton } from '@ollupi/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppearance } from '../../domains/appearance'
import { gateway } from '../../gateway/connection'
import { gatewayPath, gatewaySocket } from '../../gateway/http'
import { run } from '../../gateway/run'
import { useT } from '../../i18n'
import { SidePanel } from './SidePanel'

/** How long a stream lost, not ended, waits before it attaches again. */
const RETRY_MS = [500, 1000, 2000, 5000]

export function TerminalPanel({ workspace }: { workspace: WorkspaceRow }) {
  const t = useT().conversation.terminal
  const host = useRef<HTMLDivElement>(null)
  // A new shell replaces the one running when this changes.
  const [restarts, setRestarts] = useState(0)
  const appearance = useAppearance()
  const key = workspace.id
  // The terminal on screen, for restart to end.
  const shown = useRef<string>(undefined)

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
        // As the page's ::selection (styles.css), ink at 22%. xterm reads
        // hex and rgb() only: given color-mix() it drew the selection in
        // white, unseen on paper.
        selectionBackground: `${hex(color('--color-ink'))}38`,
        ...(dark.matches ? ansiDark : ansiLight),
      }
    }
    const term = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim(),
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      // A program that takes the mouse (vim, less, an agent's TUI) gets every
      // drag, so nothing could be selected to copy; Option-drag selects all
      // the same, as in Terminal and iTerm.
      macOptionClickForcesSelection: true,
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
    // Each attach streams what the shell printed so far, then what it
    // prints: the screen starts over with it. A stream lost, not ended,
    // attaches again.
    let live = true
    let socket: WebSocket | undefined
    let tries = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const attach = async () => {
      const opened = await run((e) => e.terminal, () => gateway().call('terminal/open', { workspaceId: key, cols: term.cols, rows: term.rows }))
      if (!live || !opened) return
      shown.current = opened.terminalId
      const ws = await gatewaySocket(gatewayPath('terminal', { terminal: opened.terminalId }))
      if (!live) return ws.close()
      socket = ws
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        tries = 0
        term.reset()
      }
      ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => term.write(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data))
      ws.onclose = (ev) => {
        if (!live || socket !== ws) return
        socket = undefined
        if (ev.code === 1000 && ev.reason.startsWith('exit')) return void term.write(`\r\n${t.exited}\r\n`)
        retry = setTimeout(() => void attach(), RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)])
      }
    }
    void attach()
    const encoder = new TextEncoder()
    const input = term.onData((text) => socket?.readyState === WebSocket.OPEN && socket.send(encoder.encode(text)))
    const resized = term.onResize(({ cols, rows }) => {
      const terminalId = shown.current
      if (terminalId) void gateway().call('terminal/resize', { terminalId, cols, rows }).catch(() => {})
    })
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(el)
    term.focus()
    return () => {
      live = false
      clearTimeout(retry)
      socket?.close()
      dark.removeEventListener('change', recolor)
      observer.disconnect()
      input.dispose()
      resized.dispose()
      term.dispose()
    }
  }, [key, restarts, appearance.scheme, t.exited])

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
            const terminalId = shown.current
            void run(
              (e) => e.terminal,
              async () => {
                if (terminalId) await gateway().call('terminal/close', { terminalId })
              },
            ).then(() => setRestarts((n) => n + 1))
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

/** An opaque CSS colour as #rrggbb, the form a canvas gives it back in. */
function hex(css: string): string {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return css
  ctx.fillStyle = css
  return ctx.fillStyle
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
