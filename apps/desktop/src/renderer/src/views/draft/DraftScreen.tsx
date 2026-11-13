// A thread that does not exist yet: pick where it runs and write the first
// message; sending creates it. Its workspace's panels and a browser show
// beside it; the pages it opens become the thread's.

import { useState } from 'react'
import { DRAFT_BROWSER } from '../../../../shared/ipc'
import { startThread } from '../../domains/conversation'
import { NEW_CONVERSATION } from '../../domains/drafts'
import { defaultEnvironment, useEnvironments } from '../../domains/environments'
import { chooseApproval, chooseEnvironment, go, useNavigation } from '../../domains/navigation'
import { useAgentPolicy } from '../../domains/backendConfig'
import { activeWorkspaces, addWorkspace, useWorkspace, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'
import { BrowserPanel } from '../conversation/BrowserPanel'
import { chip, Composer } from '../conversation/Composer'
import { EnvironmentDialog } from '../conversation/EnvironmentDialog'
import { ApprovalPicker } from '../conversation/ApprovalPicker'
import { ModelPicker } from '../conversation/ModelPicker'
import { PanelButtons } from '../conversation/PanelButtons'
import { WorkspacePanel } from '../conversation/WorkspacePanels'
import { Suggestions } from './Suggestions'

export function DraftScreen({ workspaceId }: { workspaceId: string | undefined }) {
  const workspace = useWorkspace(workspaceId)
  const panel = useNavigation((s) => s.panel)
  const environments = useEnvironments((s) => s.list)
  const chosen = useNavigation((s) => s.environment)
  const environment = environments.find((e) => e.id === chosen) ?? defaultEnvironment(environments)
  const [managing, setManaging] = useState(false)
  const approval = useNavigation((s) => s.approval)
  const agentPolicy = useAgentPolicy((s) => s.policy)
  const m = useT()
  return (
    <div className="@container/screen relative flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="drag @container flex h-16 shrink-0 items-center justify-end gap-2 pr-4">
          <PanelButtons workspace={!!workspace} thread={undefined} />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10">
          <h1 className="text-hero text-fg">{m.conversation.draft.title}</h1>
          <p className="text-ui text-fg-muted">
            {workspace ? m.conversation.draft.commandsRunIn(workspace.name) : m.conversation.draft.noFolder}
          </p>
          {
            // A cloud sandbox is where the conversation would run, and this
            // build has no machine to reach one: say so before the first task.
            environment?.kind === 'machine' && (
              <p className="max-w-md text-center text-small text-fg-subtle">{m.conversation.draft.machineHint}</p>
            )
          }
          <Suggestions workspace={workspace} />
        </div>
        <Composer
          draft={NEW_CONVERSATION}
          placeholder={m.conversation.draft.placeholder}
          onSubmit={(message) => startThread(workspaceId, message)}
          toolbar={
            <>
              <EnvironmentPicker onManage={() => setManaging(true)} />
              <WorkspacePicker workspaceId={workspaceId} />
              <ModelPicker inherited={undefined} />
              <ApprovalPicker
                value={approval}
                inherited={workspace?.settings.approvalPolicy ?? agentPolicy}
                from={workspace ? m.settings.permissions.fromWorkspace : m.settings.permissions.fromAgent}
                onChange={chooseApproval}
              />
            </>
          }
        />
      </div>
      {panel === 'browser' && <BrowserPanel thread={DRAFT_BROWSER} />}
      {workspace && <WorkspacePanel workspace={workspace} environment={environment} turn={undefined} />}
      {managing && <EnvironmentDialog onClose={() => setManaging(false)} />}
    </div>
  )
}

const ADD = '__add__'
const MANAGE = '__manage__'

function WorkspacePicker({ workspaceId }: { workspaceId: string | undefined }) {
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list))
  const current = workspaces.find((w) => w.id === workspaceId)
  const m = useT()
  return (
    <label className={chip}>
      <span className="truncate">{current?.name ?? m.conversation.draft.noWorkspace}</span>
      <select
        aria-label={m.conversation.draft.workspace}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={workspaceId ?? ''}
        onChange={(e) => (e.target.value === ADD ? void addWorkspace() : go({ kind: 'draft', workspaceId: e.target.value || undefined }))}
      >
        <option value="">{m.conversation.draft.noWorkspace}</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value={ADD}>{m.conversation.draft.addWorkspace}</option>
      </select>
    </label>
  )
}

/** Where the thread runs. This machine is one environment; the others are
 * cloud sandboxes, and a conversation keeps the one it started in. */
function EnvironmentPicker({ onManage }: { onManage(): void }) {
  const environments = useEnvironments((s) => s.list)
  const chosen = useNavigation((s) => s.environment)
  const current = environments.find((e) => e.id === chosen) ?? defaultEnvironment(environments)
  const m = useT()
  // This computer is named by the app, in the person's language; a cloud
  // sandbox keeps the name it was given.
  const nameOf = (e: { kind: string; name: string }) => (e.kind === 'machine' ? e.name : m.conversation.environment.here)
  return (
    <label className={chip}>
      <span className="truncate">{current ? nameOf(current) : m.conversation.draft.environment}</span>
      <select
        aria-label={m.conversation.draft.environment}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={current?.id ?? ''}
        onChange={(e) => (e.target.value === MANAGE ? onManage() : chooseEnvironment(e.target.value || undefined))}
      >
        {environments.map((e) => (
          <option key={e.id} value={e.id}>
            {nameOf(e)}
          </option>
        ))}
        <option value={MANAGE}>{m.conversation.environments.manage}</option>
      </select>
    </label>
  )
}
