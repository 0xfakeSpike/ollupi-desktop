// A thread that does not exist yet: pick where it runs and write the first
// message; sending creates it. Its workspace's panels and a browser show
// beside it; the pages it opens become the thread's.

import type { EnvironmentRow } from '@ollupi/protocol'
import { DRAFT_BROWSER } from '../../../../shared/ipc'
import { startThread } from '../../domains/conversation'
import { NEW_CONVERSATION } from '../../domains/drafts'
import { defaultEnvironment, environmentName, useEnvironments } from '../../domains/environments'
import { chooseApproval, chooseEnvironment, go, useNavigation, usePanel } from '../../domains/navigation'
import { useUserPolicy } from '../../domains/settings'
import { activeWorkspaces, addWorkspace, useWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { workspaceName } from '../../i18n/format'
import { BrowserPanel } from '../conversation/BrowserPanel'
import { chip, Composer } from '../conversation/Composer'
import { ApprovalPicker } from '../conversation/ApprovalPicker'
import { ModelPicker } from '../conversation/ModelPicker'
import { PanelButtons } from '../conversation/PanelButtons'
import { TodosPanel } from '../conversation/TodosPanel'
import { WorkspacePanel } from '../conversation/WorkspacePanels'
import { Suggestions } from './Suggestions'
import { Emblem, Horizon } from '../common/Wolf'
import { useThreads } from '../../domains/threads'
import { ToastHost } from '../common/Toasts'

export function DraftScreen({ workspaceId }: { workspaceId: string | undefined }) {
  const named = useWorkspace(workspaceId)
  const panel = usePanel()
  const environment = useDraftEnvironment(named?.environmentId)
  // A draft in no project starts in its environment's scratch workspace:
  // its panels are that folder's.
  const scratch = useWorkspaces((s) => s.list.find((w) => w.kind === 'scratch' && w.environmentId === environment?.id))
  const workspace = named ?? scratch
  const project = workspace && workspace.kind !== 'scratch' ? workspace : undefined
  const approval = useNavigation((s) => s.approval)
  const agentPolicy = useUserPolicy()
  const m = useT()
  // Known once the thread list has been read (more has a key per scope).
  const firstUse = useThreads((s) => Object.keys(s.more).length > 0 && s.list.length === 0)
  // The Super Agent's draft: it hands work to the projects rather than
  // running commands in a folder, so it says that instead.
  const hub = workspace?.kind === 'hub'
  return (
    <div className="@container/screen relative flex h-full">
      {/* The screen's column: a region (@ollupi/ui region.ts) whose menus,
          tooltips and notices stay out of the panels beside it. */}
      <div data-region className="relative flex min-w-0 flex-1 flex-col">
        <header className="drag @container flex h-16 shrink-0 items-center justify-end gap-2 pr-4">
          <PanelButtons workspace={!!workspace} hub={hub} thread={undefined} />
        </header>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10">
          {/* Before the first conversation ever, the little wolf says hello once. */}
          {/* The emblem the first time; under dusk, a small savanna horizon after. */}
          {firstUse ? <Emblem className="mb-3 size-16" /> : <Horizon className="pointer-events-none mb-4 h-auto w-80" />}
          <h1 className="text-hero text-fg">{hub ? m.conversation.draft.hubTitle : m.conversation.draft.title}</h1>
          <p className="max-w-md text-center text-ui text-fg-muted">
            {hub ? m.conversation.draft.hubIntro : project ? m.conversation.draft.commandsRunIn(project.name) : m.conversation.draft.noFolder}
          </p>
          {!hub && <Suggestions workspace={project} />}
          {/* Above the message box, so the box cannot paint over it. */}
          <ToastHost />
        </div>
        <Composer
          draft={NEW_CONVERSATION}
          placeholder={hub ? m.conversation.draft.hubPlaceholder : m.conversation.draft.placeholder}
          onSubmit={(message) => startThread(workspaceId, message)}
          toolbar={
            <>
              <EnvironmentPicker current={environment} inWorkspace={!!named} />
              <WorkspacePicker workspaceId={project?.id} />
              <ModelPicker inherited={undefined} />
              <ApprovalPicker
                value={approval}
                inherited={workspace?.settings.approvalPolicy ?? agentPolicy}
                from={m.settings.permissions.fromWorkspace}
                onChange={chooseApproval}
              />
            </>
          }
        />
      </div>
      {panel === 'browser' && <BrowserPanel thread={DRAFT_BROWSER} />}
      {workspace && <WorkspacePanel workspace={workspace} environment={environment} turn={undefined} />}
      {panel === 'todos' && hub && workspace && <TodosPanel />}
    </div>
  )
}

const ADD = '__add__'

/** The project the draft is in, or none: the scratch workspace of the
 * environment chosen. */
function WorkspacePicker({ workspaceId }: { workspaceId: string | undefined }) {
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list)).filter((w) => w.kind !== 'scratch')
  const current = workspaces.find((w) => w.id === workspaceId)
  const m = useT()
  return (
    <label className={chip}>
      <span className="truncate">{current ? workspaceName(m, current) : m.conversation.draft.noWorkspace}</span>
      <select
        aria-label={m.conversation.draft.workspace}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={workspaceId ?? ''}
        onChange={(e) => (e.target.value === ADD ? void addWorkspace() : go({ kind: 'draft', workspaceId: e.target.value || undefined }))}
      >
        <option value="">{m.conversation.draft.noWorkspace}</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {workspaceName(m, w)}
          </option>
        ))}
        <option value={ADD}>{m.conversation.draft.addWorkspace}</option>
      </select>
    </label>
  )
}

/** The environment the draft would run in: its workspace's, whose folder
 * the workspace is, or outside a project the environment chosen, or the
 * user's first. */
function useDraftEnvironment(workspaceEnvironment: string | undefined) {
  const environments = useEnvironments((s) => s.list)
  const chosen = useNavigation((s) => s.environment)
  const id = workspaceEnvironment ?? chosen
  return environments.find((e) => e.id === id) ?? defaultEnvironment(environments)
}

/** Where the thread runs: a conversation keeps the environment it started
 * in. In a workspace it is the workspace's; choosing another leaves the
 * workspace for a conversation outside one there. */
function EnvironmentPicker({ current, inWorkspace }: { current: EnvironmentRow | undefined; inWorkspace: boolean }) {
  const environments = useEnvironments((s) => s.list)
  const m = useT()
  const choose = (id: string) => {
    if (id === current?.id) return
    chooseEnvironment(id || undefined)
    if (inWorkspace) go({ kind: 'draft', workspaceId: undefined })
  }
  return (
    <label className={chip}>
      <span className="truncate">{current ? environmentName(current) : m.conversation.draft.environment}</span>
      <select
        aria-label={m.conversation.draft.environment}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={current?.id ?? ''}
        onChange={(e) => choose(e.target.value)}
      >
        {environments.map((e) => (
          <option key={e.id} value={e.id}>
            {environmentName(e)}
          </option>
        ))}
      </select>
    </label>
  )
}
