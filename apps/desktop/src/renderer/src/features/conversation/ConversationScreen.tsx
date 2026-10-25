import { activeTurn, latestTurn, needsAttention, threadTitle } from '@ollupi/core'
import { Badge, IconButton, Spinner } from '@ollupi/ui'
import { ArrowDown, ArrowLeft, Folder, Shield } from 'lucide-react'
import { useState } from 'react'
import { interruptTurn, openThread, sendMessage } from '../../services/actions/threads'
import { useThreadSummary, useWorkspace } from '../../stores/catalog'
import { useTimeline } from '../../stores/timelines'
import { useStickToBottom } from '../../hooks/useStickToBottom'
import { ThreadPermissionsDialog } from '../settings/ThreadPermissionsDialog'
import { Composer } from './Composer'
import { ModelPicker } from './ModelPicker'
import { TimelineView } from './TimelineView'

export function ConversationScreen({ threadId }: { threadId: string }) {
  const timeline = useTimeline(threadId)
  const summary = useThreadSummary(threadId)
  const thread = timeline?.thread ?? summary
  const workspace = useWorkspace(thread?.workspaceId)
  const running = timeline ? activeTurn(timeline) : undefined
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(threadId)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const isSubagent = !!thread?.parentThreadId

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4">
        {isSubagent && thread?.parentThreadId && (
          <IconButton label="Back to parent thread" size="sm" onClick={() => void openThread(thread.parentThreadId!)}>
            <ArrowLeft size={14} />
          </IconButton>
        )}
        {/* The summary carries the preview the bridge fills in from the first turn. */}
        <h1 className="min-w-0 truncate text-[13px] font-semibold text-fg">{threadTitle(summary ?? thread ?? { preview: '' })}</h1>
        {isSubagent && <Badge>Subagent</Badge>}
        {workspace && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle" title={workspace.rootPath}>
            <Folder size={12} />
            <span className="truncate">{workspace.name}</span>
          </span>
        )}
        {needsAttention(summary?.status) && <Badge tone="warning">Waiting for you</Badge>}
        <div className="flex-1" />
        {thread && !isSubagent && (
          <IconButton label="Thread permissions" size="sm" onClick={() => setPermissionsOpen(true)}>
            <Shield size={14} />
          </IconButton>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={ref} className="h-full overflow-y-auto">
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
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-line-strong bg-raised text-fg-muted shadow-md hover:text-fg"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={15} />
          </button>
        )}
      </div>

      {!isSubagent && (
        <Composer
          autoFocus
          placeholder={running ? 'Add to the running turn…' : 'Reply…'}
          running={!!running}
          disabled={!timeline}
          onSubmit={(text, mode) => sendMessage(threadId, text, mode)}
          onStop={() => void interruptTurn(threadId)}
          toolbar={<ModelPicker fallback={timeline ? latestTurn(timeline)?.model.connection : undefined} />}
        />
      )}
      {thread && permissionsOpen && (
        <ThreadPermissionsDialog thread={thread} onClose={() => setPermissionsOpen(false)} />
      )}
    </div>
  )
}
