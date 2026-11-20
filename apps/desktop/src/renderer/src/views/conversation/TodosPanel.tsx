// The Super Agent's plan beside its conversations, as the files it keeps in
// its folder (domains/plan): TODO.md, what is not finished, shown as
// written; under it the months it has moved done and dropped tasks to, one
// shown at a time. The app does not change them: the Super Agent writes
// them, and the user changes them by telling it so, or in the files. A
// conversation a line links to opens in the app.

import { HUB_PLAN_FILE } from '@ollupi/core'
import type { WorkspaceRow } from '@ollupi/protocol'
import { Button, cn, EmptyState } from '@ollupi/ui'
import { ExternalLink, ListTodo, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { openPath } from '../../domains/files'
import { readDoneMonth, refreshPlan, usePlan } from '../../domains/plan'
import { useLocale, useT } from '../../i18n'
import { ThreadWorkspace } from '../common/FileLink'
import { Markdown } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function TodosPanel({ hub }: { hub: WorkspaceRow }) {
  const m = useT()
  const t = m.conversation.todos
  const { text, months, version } = usePlan()
  // Opening the panel reads the files again: the user may have edited them.
  useEffect(() => void refreshPlan(), [])
  const file = useMemo(() => ({ root: hub.rootPath, path: HUB_PLAN_FILE, version }), [hub.rootPath, version])

  return (
    <SidePanel panel="todos" title={t.title} closeLabel={t.close}>
      <div className="flex flex-col gap-6">
        {text?.trim() ? (
          // A link in the file opens what it names, as in the files panel.
          <ThreadWorkspace.Provider value={hub.id}>
            <Markdown text={text} file={file} />
          </ThreadWorkspace.Provider>
        ) : (
          <EmptyState icon={<ListTodo size={20} />} title={t.emptyTitle}>
            {t.empty}
          </EmptyState>
        )}
        {months.length > 0 && <Done hub={hub} months={months} version={version} />}
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg-subtle">{t.from(HUB_PLAN_FILE)}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void refreshPlan()}>
              {t.reload}
            </Button>
            <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void openPath(`${hub.rootPath}/${HUB_PLAN_FILE}`)}>
              {t.open}
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
  )
}

/** What was done or dropped, a month at a time: the months as capsules,
 * and the one picked under them. None is open at first. */
function Done({ hub, months, version }: { hub: WorkspaceRow; months: string[]; version: number }) {
  const m = useT()
  const t = m.conversation.todos
  const locale = useLocale((s) => s.locale)
  const [month, setMonth] = useState<string>()
  const [text, setText] = useState<string>()
  useEffect(() => {
    if (!month) return setText(undefined)
    let current = true
    void readDoneMonth(hub.rootPath, month).then((read) => current && setText(read))
    return () => {
      current = false
    }
  }, [hub.rootPath, month, version])
  const file = useMemo(() => (month ? { root: hub.rootPath, path: `done/${month}.md`, version } : undefined), [hub.rootPath, month, version])
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-small font-medium text-fg-subtle">{t.done}</h3>
      <div className="flex flex-wrap gap-1.5">
        {months.map((mo) => (
          <button
            key={mo}
            type="button"
            aria-pressed={mo === month}
            onClick={() => setMonth(mo === month ? undefined : mo)}
            className={cn(
              'h-7 rounded-full px-3 text-small font-medium transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              mo === month ? 'bg-ink text-ink-fg' : 'bg-surface text-fg-muted hover:text-fg',
            )}
          >
            {monthName(mo, locale)}
          </button>
        ))}
      </div>
      {month && text !== undefined && file && (
        <ThreadWorkspace.Provider value={hub.id}>
          <Markdown text={text} file={file} />
        </ThreadWorkspace.Provider>
      )}
    </section>
  )
}

/** 2026-11 as the locale says a month: 2026年11月, Nov 2026. */
function monthName(month: string, locale: string): string {
  const [y, mo] = month.split('-').map(Number)
  return new Date(y!, mo! - 1, 1).toLocaleDateString(locale, { year: 'numeric', month: 'short' })
}
