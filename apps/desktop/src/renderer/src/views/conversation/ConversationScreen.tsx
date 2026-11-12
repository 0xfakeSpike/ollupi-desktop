import { activeTurn, lastConnection, needsUser, waitingFor, type Timeline } from '@ollupi/core'
import { Badge, Button, cn, IconButton, Loader, useTooltip } from '@ollupi/ui'
import { ArchiveRestore, ArrowDown, ArrowLeft, Cloud } from 'lucide-react'
import { useAgentPolicy } from '../../domains/backendConfig'
import { interrupt, openThread, sendMessage, updateThreadPermissions, useTimeline } from '../../domains/conversation'
import { defaultEnvironment, useEnvironment, useEnvironments } from '../../domains/environments'
import { openPanel, useNavigation } from '../../domains/navigation'
import { archiveThread, renameThread, useThreadSummary } from '../../domains/threads'
import { useWorkspace } from '../../domains/workspaces'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'
import { areaClass } from '../common/areas'
import { TitleInput } from '../common/TitleInput'
import { useStickToBottom } from '../common/useStickToBottom'
import { ApprovalPicker } from './ApprovalPicker'
import { BrowserPanel } from './BrowserPanel'
import { Composer } from './Composer'
import { ContextPanel } from './ContextPanel'
import { ModelPicker } from './ModelPicker'
import { PermissionsPanel } from './PermissionsPanel'
import { TasksPanel } from './TasksPanel'
import { TimelineView } from './TimelineView'
import { useWaitingOutOfView } from './useWaitingOutOfView'
import { PanelButtons } from './PanelButtons'
import { WorkspacePanel } from './WorkspacePanels'

export function ConversationScreen({ threadId }: { threadId: string }) {
  const timeline = useTimeline(threadId)
  const summary = useThreadSummary(threadId)
  const thread = timeline?.thread ?? summary
  const workspace = useWorkspace(thread?.workspaceId)
  // Where the thread runs: this machine keeps quiet, a cloud sandbox says so.
  const environment = useEnvironment(thread?.environmentId)
  // A thread that names none runs where ollupi starts conversations.
  const fallback = useEnvironments((s) => defaultEnvironment(s.list))
  const running = timeline && activeTurn(timeline)
  const parent = thread?.parentThreadId
  // ollupi takes no messages in an archived thread (threadArchived).
  const archived = !!thread?.archivedAt
  const [renaming, setRenaming] = useState(false)
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(threadId)
  const panel = useNavigation((s) => s.panel)
  const m = useT()
  const agentPolicy = useAgentPolicy((s) => s.policy)
  const latestTip = useTooltip({ label: m.conversation.screen.scrollToLatest })
  const renameTip = useTooltip({ label: m.conversation.screen.rename })
  const rootTip = useTooltip({ label: workspace?.rootPath ?? '' })
  const machineTip = useTooltip({ label: m.conversation.environments.machine })
  const waiting = useWaitingOutOfView(ref, threadId)
  useEscapeStops(threadId, !!running && waiting.count === 0)

  return (
    <div className="@container/screen relative flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Where you are first: the area's colour and name, then the title; on the
            right only what waits for you and the one Tools capsule. */}
        <header className="drag @container flex h-16 shrink-0 items-center gap-2.5 pr-4 pl-5">
          {parent && (
            <IconButton label={m.conversation.screen.back} size="sm" onClick={() => void openThread(parent)}>
              <ArrowLeft size={14} />
            </IconButton>
          )}
          {workspace && (
            <>
              <span
                className={cn('flex h-7 max-w-48 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-small font-semibold text-fg', areaClass(workspace.id))}
                {...rootTip.trigger}
              >
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ink" />
                <span className="truncate">{workspace.name}</span>
              </span>
              {rootTip.tooltip}
            </>
          )}
          {renaming && thread ? (
            <TitleInput
              initial={thread.title}
              label={m.conversation.screen.rename}
              className="h-8 w-80 rounded-full px-3 text-title"
              onSave={(title) => renameThread(threadId, title)}
              onDone={() => setRenaming(false)}
            />
          ) : thread && !parent ? (
            // Renaming is for threads the person started; a subagent's is named by its task.
            <>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="min-w-0 truncate rounded-full px-1.5 text-title text-fg hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
                {...renameTip.trigger}
              >
                {threadTitle(m, thread)}
              </button>
              {renameTip.tooltip}
            </>
          ) : (
            <h1 className="min-w-0 truncate px-1.5 text-title text-fg">{thread ? threadTitle(m, thread) : m.conversation.screen.untitled}</h1>
          )}
          {parent && <Badge>{m.conversation.screen.subagent}</Badge>}
          {environment && environment.kind !== 'local' && (
            <>
              <span className="flex min-w-0 items-center gap-1 text-small text-fg-subtle" {...machineTip.trigger}>
                <Cloud size={14} className="shrink-0" />
                <span className="truncate">{environment.name}</span>
              </span>
              {machineTip.tooltip}
            </>
          )}
          <div className="flex-1" />
          {needsUser(summary?.status) && (
            <span className="flex h-8 shrink-0 items-center rounded-full bg-accent-soft px-3.5 text-ui font-semibold text-accent">
              {waiting.count > 0 ? m.conversation.screen.waitingCount(waiting.count) : m.conversation.screen.waiting}
            </span>
          )}
          <PanelButtons workspace={!!workspace} thread={thread ? threadId : undefined} />
        </header>

        <div className="relative min-h-0 flex-1">
          <div ref={ref} className="scroll-centered fade-edges h-full overflow-y-auto">
            {timeline ? (
              <TimelineView timeline={timeline} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader label={m.conversation.screen.loading} />
              </div>
            )}
          </div>
          {waiting.hidden ? (
            <button
              type="button"
              onClick={waiting.reveal}
              className="absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 animate-enter items-center gap-1.5 rounded-full border border-accent/35 bg-raised px-3 text-ui font-medium text-accent shadow-md transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none motion-reduce:animate-fade"
            >
              {m.conversation.screen.requestsWaiting(waiting.count)}
              <ArrowDown size={14} />
            </button>
          ) : !atBottom && (
            <>
              <button
                type="button"
                aria-label={m.conversation.screen.scrollToLatest}
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 animate-enter items-center justify-center rounded-full bg-raised text-fg-muted shadow-md transition-colors duration-100 ease-standard hover:text-fg motion-reduce:animate-fade"
                {...latestTip.trigger}
              >
                <ArrowDown size={16} />
              </button>
              {latestTip.tooltip}
            </>
          )}
        </div>

        {timeline && <StatusLine timeline={timeline} />}
        {archived ? (
          <div className="flex items-center justify-center gap-3 px-6 pb-5 text-small text-fg-subtle">
            {m.conversation.screen.archived}
            <Button size="sm" icon={<ArchiveRestore size={14} />} onClick={() => void archiveThread(threadId, false)}>
              {m.conversation.screen.restore}
            </Button>
          </div>
        ) : parent ? (
          // ollupi refuses messages to a subagent's thread (ErrSubagentThread):
          // it works on the task its parent gave it and reports back there.
          <p className="px-6 pb-5 text-center text-small text-fg-subtle">
            {m.conversation.screen.subagentNote}
          </p>
        ) : (
          <Composer
            draft={threadId}
            placeholder={running ? m.conversation.screen.addToTurn : m.conversation.screen.reply}
            running={!!running}
            disabled={!timeline}
            onSubmit={(message, mode) => sendMessage(threadId, message, mode)}
            onStop={() => void interrupt(threadId)}
            toolbar={
              <>
                <ModelPicker inherited={timeline && lastConnection(timeline)} />
                {thread && (
                  <ApprovalPicker
                    value={thread.settings.approvalPolicy}
                    inherited={workspace?.settings.approvalPolicy ?? agentPolicy}
                    from={workspace ? m.settings.permissions.fromWorkspace : m.settings.permissions.fromAgent}
                    // The thread's own rules stay; only its policy changes, or goes to inherit.
                    onChange={(p) => void updateThreadPermissions(thread.id, { permissions: thread.settings.permissions, ...(p ? { approvalPolicy: p } : {}) })}
                    onRules={() => openPanel('permissions')}
                  />
                )}
              </>
            }
          />
        )}
      </div>
      {/* Each conversation has its own tab. */}
      {panel === 'browser' && <BrowserPanel key={threadId} thread={threadId} />}
      {workspace && <WorkspacePanel workspace={workspace} environment={environment ?? fallback} turn={running?.id} />}
      {panel === 'tasks' && <TasksPanel timeline={timeline} />}
      {panel === 'permissions' && thread && !parent && <PermissionsPanel thread={thread} />}
      {panel === 'context' && <ContextPanel timeline={timeline} />}
    </div>
  )
}

/** Esc stops the running turn, as the stop button does, from the message box
 * or anywhere on the screen outside a field, menu or dialog that has its
 * own use for it. Not while a card waits for the person: there Esc declines
 * or leaves the card alone. */
function useEscapeStops(threadId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-overlay]')) return
      if (el instanceof HTMLInputElement || (el instanceof HTMLTextAreaElement && !el.closest('[data-composer]'))) return
      e.preventDefault()
      void interrupt(threadId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [threadId, enabled])
}

/** Above the message box while a turn runs, in one plain sentence: a
 * breathing dot while it works, the signal's dot when an approval or an
 * answer waits above. */
function StatusLine({ timeline }: { timeline: Timeline }) {
  const status = useThreadSummary(timeline.thread.id)?.status
  const m = useT()
  if (!activeTurn(timeline)) return null
  const waiting = waitingFor(timeline, status)
  return (
    <div className="mx-auto flex w-full max-w-thread items-center gap-2 px-8 pb-2.5 text-ui text-fg-muted" role="status">
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', waiting ? 'bg-accent' : 'breathe bg-ink')} />
      {waiting === 'approval' ? m.conversation.screen.waitingApproval : waiting === 'answer' ? m.conversation.screen.waitingAnswer : m.conversation.screen.working}
    </div>
  )
}
