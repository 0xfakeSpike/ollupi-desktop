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
    const css = getComputedStyle(document.documentElement)
    const color = (name: string) => css.getPropertyValue(name).trim()
    const term = new Terminal({
      fontFamily: color('--font-mono'),
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: color('--color-canvas'), foreground: color('--color-fg'), cursor: color('--color-fg'), selectionBackground: color('--color-selected') },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    // What the shell printed before open answered is in its answer; only
    // what follows is drawn as it comes.
    let ready = false
    const offData = desktop.terminal.onData((k, text) => ready && k === key && term.write(text))
    const offExit = desktop.terminal.onExit((k) => k === key && term.write(`\r\n${t.exited}\r\n`))
    void desktop.terminal.open(key, cwd, term.cols, term.rows).then((past) => {
      ready = true
      if (past) term.write(past)
    })
    const input = term.onData((text) => void desktop.terminal.write(key, text))
    const resized = term.onResize(({ cols, rows }) => void desktop.terminal.resize(key, cols, rows))
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(el)
    term.focus()
    return () => {
      observer.disconnect()
      input.dispose()
      resized.dispose()
      offData()
      offExit()
      term.dispose()
    }
  }, [key, cwd, restarts, appearance.palette, appearance.scheme, t.exited])

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
