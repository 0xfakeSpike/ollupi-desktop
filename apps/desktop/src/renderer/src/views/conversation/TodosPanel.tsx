// The Super Agent's plan beside its conversations: the Markdown file it
// keeps at the root of its folder (HUB_PLAN_FILE), shown as written. The
// app keeps no todos of its own and does not change the file: the Super
// Agent writes it as it hands work out, and the user changes it by telling
// it so, or in the file. It is read again when the panel opens, when the
// window comes back to the front, and when a write to the file ends in the
// conversation beside it.

import { callOf, HUB_PLAN_FILE, type Timeline } from '@ollupi/core'
import type { WorkspaceRow } from '@ollupi/protocol'
import { Button, EmptyState } from '@ollupi/ui'
import { ExternalLink, ListTodo, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { openPath, readTextQuietly } from '../../domains/files'
import { useT } from '../../i18n'
import { ThreadWorkspace } from '../common/FileLink'
import { Markdown } from '../common/Markdown'
import { SidePanel } from './SidePanel'

export function TodosPanel({ hub, timeline }: { hub: WorkspaceRow; timeline?: Timeline }) {
  const m = useT()
  const t = m.conversation.todos
  const written = useMemo(() => planWrites(timeline), [timeline])
  const [version, setVersion] = useState(0)
  const [text, setText] = useState<string>()

  useEffect(() => {
    const again = () => setVersion((v) => v + 1)
    window.addEventListener('focus', again)
    return () => window.removeEventListener('focus', again)
  }, [])
  useEffect(() => {
    let current = true
    void readTextQuietly(hub.rootPath, HUB_PLAN_FILE).then((read) => current && setText(read))
    return () => {
      current = false
    }
  }, [hub.rootPath, written, version])

  const file = useMemo(() => ({ root: hub.rootPath, path: HUB_PLAN_FILE, version }), [hub.rootPath, version])
  return (
    <SidePanel panel="todos" title={t.title} closeLabel={t.close}>
      {text?.trim() ? (
        <div className="flex flex-col gap-4">
          {/* A link in the file opens what it names, as in the files panel. */}
          <ThreadWorkspace.Provider value={hub.id}>
            <Markdown text={text} file={file} />
          </ThreadWorkspace.Provider>
          <div className="flex flex-col gap-2">
            <p className="text-small text-fg-subtle">{t.from(HUB_PLAN_FILE)}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => setVersion((v) => v + 1)}>
                {t.reload}
              </Button>
              <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void openPath(`${hub.rootPath}/${HUB_PLAN_FILE}`)}>
                {t.open}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon={<ListTodo size={20} />} title={t.emptyTitle}>
          {t.empty}
        </EmptyState>
      )}
    </SidePanel>
  )
}

/** The writes to the plan file that went through in the conversation, as
 * one key that changes with each: the panel reads the file again then. */
function planWrites(timeline: Timeline | undefined): string {
  if (!timeline) return ''
  return timeline.items
    .filter((it) => {
      if (it.type !== 'toolCall' || it.status !== 'completed') return false
      const call = callOf(it)
      return call.kind === 'file' && (call.change.path === HUB_PLAN_FILE || call.change.path.endsWith(`/${HUB_PLAN_FILE}`))
    })
    .map((it) => it.id)
    .join(',')
}
