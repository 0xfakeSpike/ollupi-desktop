import { activeTurn, lastConnection, needsUser } from '@ollupi/core'
import { Badge, IconButton, Spinner } from '@ollupi/ui'
import { ArrowDown, ArrowLeft, CalendarClock, Folder, Gauge, Shield } from 'lucide-react'
import { useState } from 'react'
import { interrupt, openThread, sendMessage, useTimeline } from '../../domains/conversation'
import { useThreadJobs } from '../../domains/cron'
import { toggleContextPanel, useNavigation } from '../../domains/navigation'
import { useThreadSummary } from '../../domains/threads'
import { useWorkspace } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'
import { useStickToBottom } from '../common/useStickToBottom'
import { CronDialog } from '../cron/CronDialog'
import { ThreadPermissionsDialog } from '../settings/ThreadPermissionsDialog'
import { Composer } from './Composer'
import { ContextPanel } from './ContextPanel'
import { ModelPicker } from './ModelPicker'
import { TimelineView } from './TimelineView'

type Dialog = 'permissions' | 'cron' | undefined

export function ConversationScreen({ threadId }: { threadId: string }) {
  const timeline = useTimeline(threadId)
  const summary = useThreadSummary(threadId)
  const thread = timeline?.thread ?? summary
  const workspace = useWorkspace(thread?.workspaceId)
  const jobs = useThreadJobs(threadId)
  const running = timeline && activeTurn(timeline)
  const parent = thread?.parentThreadId
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(threadId)
  const [dialog, setDialog] = useState<Dialog>()
  const contextOpen = useNavigation((s) => s.contextPanel)
  const m = useT()

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        {parent && (
          <IconButton label={m.conversation.screen.back} size="sm" className="-ml-1" onClick={() => void openThread(parent)}>
            <ArrowLeft size={14} />
          </IconButton>
        )}
        <h1 className="min-w-0 truncate text-ui font-semibold text-fg">{thread ? threadTitle(m, thread) : m.conversation.screen.untitled}</h1>
        {parent && <Badge>{m.conversation.screen.subagent}</Badge>}
        {workspace && (
          <span className="flex min-w-0 items-center gap-1 text-small text-fg-subtle" title={workspace.rootPath}>
            <Folder size={14} className="shrink-0" />
            <span className="truncate">{workspace.name}</span>
          </span>
        )}
        {needsUser(summary?.status) && <Badge tone="accent">{m.conversation.screen.waiting}</Badge>}
        <div className="flex-1" />
        {thread && !parent && (
          <>
            <IconButton label={m.conversation.screen.scheduledTasks} onClick={() => setDialog('cron')} className="relative">
              <CalendarClock size={16} />
              {!!jobs?.length && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />}
            </IconButton>
            <IconButton label={m.conversation.screen.permissions} onClick={() => setDialog('permissions')}>
              <Shield size={16} />
            </IconButton>
          </>
        )}
        <IconButton label={m.conversation.screen.context} active={contextOpen} onClick={toggleContextPanel}>
          <Gauge size={16} />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <div ref={ref} className="scroll-centered h-full overflow-y-auto">
              {timeline ? (
                <TimelineView timeline={timeline} />
              ) : (
                <div className="flex h-full items-center justify-center text-fg-subtle">
                  <Spinner />
                </div>
              )}
            </div>
            {!atBottom && (
              <button
                type="button"
                aria-label={m.conversation.screen.scrollToLatest}
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 animate-enter items-center justify-center rounded-full border border-line bg-raised text-fg-muted shadow-md transition-colors duration-100 ease-standard hover:text-fg motion-reduce:animate-fade"
              >
                <ArrowDown size={16} />
              </button>
            )}
          </div>

          {parent ? (
            // ollupi refuses messages to a subagent's thread (ErrSubagentThread):
            // it works on the task its parent gave it and reports back there.
            <p className="px-6 pb-5 text-center text-small text-fg-subtle">
              {m.conversation.screen.subagentNote}
            </p>
          ) : (
            <Composer
              placeholder={running ? m.conversation.screen.addToTurn : m.conversation.screen.reply}
              running={!!running}
              disabled={!timeline}
              onSubmit={(text, mode) => sendMessage(threadId, text, mode)}
              onStop={() => void interrupt(threadId)}
              toolbar={<ModelPicker inherited={timeline && lastConnection(timeline)} />}
            />
          )}
        </div>
        {contextOpen && <ContextPanel timeline={timeline} />}
      </div>

      {thread && dialog === 'permissions' && <ThreadPermissionsDialog thread={thread} onClose={() => setDialog(undefined)} />}
      {dialog === 'cron' && <CronDialog threadId={threadId} onClose={() => setDialog(undefined)} />}
    </div>
  )
}
