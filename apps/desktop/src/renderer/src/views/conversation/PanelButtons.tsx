// The header's way into a conversation's panels: each panel is a capsule
// of its own, with a line on what it is for in its tooltip, and the one
// open reads as on; picking it again closes it. The export, an action and
// no panel, sits in a small menu after them. In a narrow header (the
// window, or a panel beside the conversation) the capsules keep only their
// icons.

import { cn, TileMenu, useTooltip, type PickerAction } from '@ollupi/ui'
import { Download, FolderTree, Gauge, GitBranch, Globe, ListChecks, ListTodo, SquareTerminal, type LucideIcon } from 'lucide-react'
import { exportThread } from '../../domains/export'
import { togglePanel, usePanel, type Panel } from '../../domains/navigation'
import { useT } from '../../i18n'

const ICONS: Partial<Record<Panel, LucideIcon>> = {
  browser: Globe,
  files: FolderTree,
  environment: GitBranch,
  terminal: SquareTerminal,
  tasks: ListChecks,
  context: Gauge,
  todos: ListTodo,
}

// Capsules on the canvas; in a narrow header (the window, or a panel beside
// the conversation) only their icons stay, and the tooltip names them.
const capsule =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-ui font-semibold transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none'
// On reads like a switch that is on: moss, so the open panel's button is
// found at a glance among its neighbours.
const state = (on: boolean) => (on ? 'bg-ink text-ink-fg hover:opacity-90' : 'bg-ground text-fg-muted hover:text-fg')

/** workspace: the workspace's own panels are offered (files, changes,
 * terminal); thread: the conversation's (plan, context) and its export;
 * hub: the Super Agent's, whose plan (todos) comes first and whose folder
 * holds no project's files, so it has the browser and the conversation's
 * panels only. Put it in a header that is an `@container`. */
export function PanelButtons({ workspace, thread, hub = false }: { workspace: boolean; thread: string | undefined; hub?: boolean }) {
  const panel = usePanel()
  const m = useT()
  const t = m.conversation.more
  const own = workspace && !hub
  const panels: Panel[] = [
    ...(hub ? (['todos'] as const) : []),
    'browser',
    ...(own ? (['files', 'environment', 'terminal'] as const) : []),
    ...(thread ? (['tasks', 'context'] as const) : []),
  ]
  // Six capsules with their names need a wider header than four do.
  const named = panels.length > 4 ? '@5xl' : '@3xl'
  const exports: PickerAction[] = thread
    ? [
        { label: t.exportMarkdown, icon: <Download size={14} aria-hidden />, onSelect: () => void exportThread(thread, 'markdown') },
        { label: t.exportJson, icon: <Download size={14} aria-hidden />, onSelect: () => void exportThread(thread, 'json') },
      ]
    : []
  return (
    <>
      {panels.map((p) => (
        <PanelButton key={p} panel={p} on={panel === p} named={named} />
      ))}
      {exports.length > 0 && (
        <TileMenu label={t.export} value={undefined} tiles={[]} onPick={() => {}} actions={exports} className={cn(capsule, state(false))}>
          <Download size={14} aria-hidden />
        </TileMenu>
      )}
    </>
  )
}

function PanelButton({ panel, on, named }: { panel: Panel; on: boolean; named: '@3xl' | '@5xl' }) {
  const m = useT()
  const Icon = ICONS[panel]!
  const name = m.conversation.screen[panel]
  const { trigger, tooltip } = useTooltip({ label: name, hint: m.conversation.more.about[panel as keyof typeof m.conversation.more.about] })
  return (
    <>
      <button
        type="button"
        aria-label={name}
        aria-pressed={on}
        onClick={() => togglePanel(panel)}
        className={cn(capsule, state(on), named === '@5xl' ? '@5xl:px-3.5' : '@3xl:px-3.5')}
        {...trigger}
      >
        <Icon size={14} aria-hidden />
        <span className={cn('hidden', named === '@5xl' ? '@5xl:inline' : '@3xl:inline')}>{name}</span>
      </button>
      {tooltip}
    </>
  )
}
