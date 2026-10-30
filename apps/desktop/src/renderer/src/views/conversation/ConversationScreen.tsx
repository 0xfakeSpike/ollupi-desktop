import { activeTurn, lastConnection, needsUser } from '@ollupi/core'
import { Badge, Button, IconButton, Spinner, useTooltip } from '@ollupi/ui'
import { ArchiveRestore, ArrowDown, ArrowLeft, Download, FileDiff, Folder, FolderTree, Gauge, Globe, ListChecks, Shield, SquareTerminal } from 'lucide-react'
import { interrupt, openThread, sendMessage, useTimeline } from '../../domains/conversation'
import { exportThread, type ExportFormat } from '../../domains/export'
import { togglePanel, useNavigation } from '../../domains/navigation'
import { archiveThread, renameThread, useThreadSummary } from '../../domains/threads'
import { useWorkspace } from '../../domains/workspaces'
import { useState } from 'react'
import { useT } from '../../i18n'
import { threadTitle } from '../../i18n/format'
import { TitleInput } from '../common/TitleInput'
import { useStickToBottom } from '../common/useStickToBottom'
import { BrowserPanel } from './BrowserPanel'
import { ChangesPanel } from './ChangesPanel'
import { Composer } from './Composer'
import { FilesPanel } from './FilesPanel'
import { ContextPanel } from './ContextPanel'
import { ModelPicker } from './ModelPicker'
import { PermissionsPanel } from './PermissionsPanel'
import { TasksPanel } from './TasksPanel'
import { TerminalPanel } from './TerminalPanel'
import { TimelineView } from './TimelineView'

export function ConversationScreen({ threadId }: { threadId: string }) {
  const timeline = useTimeline(threadId)
  const summary = useThreadSummary(threadId)
  const thread = timeline?.thread ?? summary
  const workspace = useWorkspace(thread?.workspaceId)
  const running = timeline && activeTurn(timeline)
  const parent = thread?.parentThreadId
  // ollupi takes no messages in an archived thread (threadArchived).
  const archived = !!thread?.archivedAt
  const [renaming, setRenaming] = useState(false)
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(threadId)
  const panel = useNavigation((s) => s.panel)
  const m = useT()
  const latestTip = useTooltip({ label: m.conversation.screen.scrollToLatest })

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        {parent && (
          <IconButton label={m.conversation.screen.back} size="sm" className="-ml-1" onClick={() => void openThread(parent)}>
            <ArrowLeft size={14} />
          </IconButton>
        )}
        {renaming && thread ? (
          <TitleInput
            initial={thread.title}
            label={m.conversation.screen.rename}
            className="h-7 w-80 text-ui font-semibold"
            onSave={(title) => renameThread(threadId, title)}
            onDone={() => setRenaming(false)}
          />
        ) : thread && !parent ? (
          // Renaming is for threads the person started; a subagent's is named by its task.
          <button
            type="button"
            title={m.conversation.screen.rename}
            onClick={() => setRenaming(true)}
            className="-mx-1 min-w-0 truncate rounded-md px-1 text-ui font-semibold text-fg hover:bg-hover"
          >
            {threadTitle(m, thread)}
          </button>
        ) : (
          <h1 className="min-w-0 truncate text-ui font-semibold text-fg">{thread ? threadTitle(m, thread) : m.conversation.screen.untitled}</h1>
        )}
        {parent && <Badge>{m.conversation.screen.subagent}</Badge>}
        {workspace && (
          <span className="flex min-w-0 items-center gap-1 text-small text-fg-subtle" title={workspace.rootPath}>
            <Folder size={14} className="shrink-0" />
            <span className="truncate">{workspace.name}</span>
          </span>
        )}
        {needsUser(summary?.status) && <Badge tone="accent">{m.conversation.screen.waiting}</Badge>}
        <div className="flex-1" />
        <IconButton label={m.conversation.screen.browser} active={panel === 'browser'} onClick={() => togglePanel('browser')}>
          <Globe size={16} />
        </IconButton>
        {workspace && (
          <IconButton label={m.conversation.screen.files} active={panel === 'files'} onClick={() => togglePanel('files')}>
            <FolderTree size={16} />
          </IconButton>
        )}
        {workspace && (
          <IconButton label={m.conversation.screen.changes} active={panel === 'changes'} onClick={() => togglePanel('changes')}>
            <FileDiff size={16} />
          </IconButton>
        )}
        {workspace && (
          <IconButton label={m.conversation.screen.terminal} active={panel === 'terminal'} onClick={() => togglePanel('terminal')}>
            <SquareTerminal size={16} />
          </IconButton>
        )}
        <IconButton label={m.conversation.screen.tasks} active={panel === 'tasks'} onClick={() => togglePanel('tasks')}>
          <ListChecks size={16} />
        </IconButton>
        {thread && !parent && (
          <IconButton label={m.conversation.screen.permissions} active={panel === 'permissions'} onClick={() => togglePanel('permissions')}>
            <Shield size={16} />
          </IconButton>
        )}
        <IconButton label={m.conversation.screen.context} active={panel === 'context'} onClick={() => togglePanel('context')}>
          <Gauge size={16} />
        </IconButton>
        {thread && <ExportButton threadId={threadId} />}
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
              <>
                <button
                  type="button"
                  aria-label={m.conversation.screen.scrollToLatest}
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 animate-enter items-center justify-center rounded-full border border-line bg-raised text-fg-muted shadow-md transition-colors duration-100 ease-standard hover:text-fg motion-reduce:animate-fade"
                  {...latestTip.trigger}
                >
                  <ArrowDown size={16} />
                </button>
                {latestTip.tooltip}
              </>
            )}
          </div>

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
              placeholder={running ? m.conversation.screen.addToTurn : m.conversation.screen.reply}
              running={!!running}
              disabled={!timeline}
              onSubmit={(message, mode) => sendMessage(threadId, message, mode)}
              onStop={() => void interrupt(threadId)}
              toolbar={<ModelPicker inherited={timeline && lastConnection(timeline)} />}
            />
          )}
        </div>
        {/* Each conversation has its own tab. */}
        {panel === 'browser' && <BrowserPanel key={threadId} thread={threadId} />}
        {/* One tree per workspace: threads of the same workspace keep its open folders. */}
        {panel === 'files' && workspace && <FilesPanel key={workspace.id} workspace={workspace} />}
        {panel === 'changes' && workspace && <ChangesPanel key={workspace.id} workspace={workspace} turn={running?.id} />}
        {panel === 'terminal' && workspace && <TerminalPanel key={workspace.id} workspace={workspace} />}
        {panel === 'tasks' && <TasksPanel timeline={timeline} />}
        {panel === 'permissions' && thread && !parent && <PermissionsPanel thread={thread} />}
        {panel === 'context' && <ContextPanel timeline={timeline} />}
      </div>
    </div>
  )
}

/** A menu of formats, as a native select under an icon: picking one saves
 * the thread in it. */
function ExportButton({ threadId }: { threadId: string }) {
  const t = useT().conversation.export
  const tip = useTooltip({ label: t.label })
  return (
    <label className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg" {...tip.trigger}>
      <Download size={16} />
      <select
        aria-label={t.label}
        value=""
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => void exportThread(threadId, e.target.value as ExportFormat)}
      >
        <option value="" disabled>
          {t.label}
        </option>
        <option value="markdown">{t.markdown}</option>
        <option value="json">{t.json}</option>
      </select>
      {tip.tooltip}
    </label>
  )
}
