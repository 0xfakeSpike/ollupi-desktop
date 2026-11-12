// The header's way into a conversation's panels. The two used most, the
// browser and the files, are buttons of their own; the rest (changes,
// terminal, plan, context) and the export sit behind "More", each with a
// line on what it is for (PRODUCT.md: the first layer shows only what the
// person needs). A panel's button, or More when the open panel is one of
// its own, reads as on; picking the open panel closes it.

import { cn, Picker, useTooltip, type PickerAction, type PickerOption } from '@ollupi/ui'
import { ChevronDown, Download, Ellipsis, FolderTree, Gauge, GitBranch, Globe, ListChecks, SquareTerminal, type LucideIcon } from 'lucide-react'
import { exportThread } from '../../domains/export'
import { openPanel, togglePanel, useNavigation, type Panel } from '../../domains/navigation'
import { useT } from '../../i18n'

const ICONS: Partial<Record<Panel, LucideIcon>> = {
  browser: Globe,
  files: FolderTree,
  environment: GitBranch,
  terminal: SquareTerminal,
  tasks: ListChecks,
  context: Gauge,
}

// Capsules on the canvas; in a narrow header (the window, or a panel beside
// the conversation) only their icons stay, and the tooltip names them.
const capsule =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-ui font-semibold transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none @3xl:px-3.5'
// On reads like a switch that is on: moss, so the open panel's button is
// found at a glance among its neighbours.
const state = (on: boolean) => (on ? 'bg-ink text-ink-fg hover:opacity-90' : 'bg-ground text-fg-muted hover:text-fg')

/** workspace: the workspace's own panels are offered (files, changes,
 * terminal); thread: the conversation's (plan, context) and its export.
 * Put it in a header that is an `@container`. */
export function PanelButtons({ workspace, thread }: { workspace: boolean; thread: string | undefined }) {
  const panel = useNavigation((s) => s.panel)
  const m = useT()
  const t = m.conversation.more
  const outside: Panel[] = ['browser', ...(workspace ? (['files'] as const) : [])]
  const inside: Panel[] = [...(workspace ? (['environment', 'terminal'] as const) : []), ...(thread ? (['tasks', 'context'] as const) : [])]
  const options: PickerOption<Panel>[] = inside.map((p) => {
    const Icon = ICONS[p]!
    return {
      value: p,
      label: (
        <span className="flex items-center gap-2">
          <Icon size={14} className="shrink-0 text-fg-muted" aria-hidden />
          {m.conversation.screen[p]}
        </span>
      ),
      description: t.about[p as keyof typeof t.about],
    }
  })
  const actions: PickerAction[] = thread
    ? [
        { label: t.exportMarkdown, icon: <Download size={14} />, onSelect: () => void exportThread(thread, 'markdown') },
        { label: t.exportJson, icon: <Download size={14} />, onSelect: () => void exportThread(thread, 'json') },
      ]
    : []
  const open = panel && inside.includes(panel) ? panel : undefined
  return (
    <>
      {outside.map((p) => (
        <PanelButton key={p} panel={p} on={panel === p} />
      ))}
      {(options.length > 0 || actions.length > 0) && (
        <Picker
          label={t.label}
          value={open}
          options={options}
          onChange={(p) => (p === panel ? togglePanel(p) : openPanel(p))}
          actions={actions}
          width={300}
          className={cn(capsule, state(!!open))}
        >
          <Ellipsis size={14} aria-hidden />
          <span className="hidden @3xl:inline">{open ? m.conversation.screen[open] : t.label}</span>
          <ChevronDown size={12} className="hidden opacity-60 @3xl:block" aria-hidden />
        </Picker>
      )}
    </>
  )
}

function PanelButton({ panel, on }: { panel: Panel; on: boolean }) {
  const m = useT()
  const Icon = ICONS[panel]!
  const name = m.conversation.screen[panel]
  const { trigger, tooltip } = useTooltip({ label: name, hint: m.conversation.more.about[panel as keyof typeof m.conversation.more.about] })
  return (
    <>
      <button type="button" aria-label={name} aria-pressed={on} onClick={() => togglePanel(panel)} className={cn(capsule, state(on))} {...trigger}>
        <Icon size={14} aria-hidden />
        <span className="hidden @3xl:inline">{name}</span>
      </button>
      {tooltip}
    </>
  )
}
