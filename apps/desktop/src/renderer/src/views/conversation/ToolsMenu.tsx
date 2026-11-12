// Every panel a conversation can open, behind one "Tools" capsule rather
// than a row of icons to learn (PRODUCT.md: the first layer shows only what
// the person needs). Each choice says in a line what the panel is for;
// picking the open one closes it. A thread can also be exported from here.

import { cn, Picker, type PickerAction, type PickerOption } from '@ollupi/ui'
import { ChevronDown, Download, FolderTree, Gauge, GitBranch, Globe, LayoutGrid, ListChecks, SquareTerminal, type LucideIcon } from 'lucide-react'
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

/** workspace: the workspace's own panels are offered (files, changes,
 * terminal); thread: the conversation's (tasks, context) and its export. */
export function ToolsMenu({ workspace, thread }: { workspace: boolean; thread: string | undefined }) {
  const panel = useNavigation((s) => s.panel)
  const m = useT()
  const t = m.conversation.tools
  const shown: Panel[] = ['browser', ...(workspace ? (['files', 'environment', 'terminal'] as const) : []), ...(thread ? (['tasks', 'context'] as const) : [])]
  const options: PickerOption<Panel>[] = shown.map((p) => {
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
  const open = panel && shown.includes(panel) ? panel : undefined
  return (
    <Picker
      label={t.label}
      value={open}
      options={options}
      onChange={(p) => (p === panel ? togglePanel(p) : openPanel(p))}
      actions={actions}
      width={300}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-ui font-semibold transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
        open ? 'bg-ink text-ink-fg' : 'bg-ground text-fg-muted hover:text-fg',
      )}
    >
      <LayoutGrid size={14} aria-hidden />
      {open ? m.conversation.screen[open] : t.label}
      <ChevronDown size={12} className="opacity-60" aria-hidden />
    </Picker>
  )
}
