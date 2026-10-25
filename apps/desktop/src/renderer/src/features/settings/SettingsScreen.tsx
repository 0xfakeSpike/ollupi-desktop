import type { WorkspaceRow } from '@ollupi/protocol'
import { Badge, Button, Disclosure, Input } from '@ollupi/ui'
import { Archive, ArchiveRestore, FileCog, FolderOpen, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo } from '../../../../shared/ipc'
import { archiveWorkspace, renameWorkspace, updateWorkspacePermissions } from '../../services/actions/workspaces'
import { desktop } from '../../services/desktop'
import { useCatalog } from '../../stores/catalog'
import { useConnection } from '../../stores/connection'
import { PermissionEditor } from './PermissionEditor'

export function SettingsScreen() {
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
          <BackendSection />
          <WorkspacesSection />
        </div>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function BackendSection() {
  const backend = useConnection((s) => s.backend)
  const serverVersion = useConnection((s) => s.serverVersion)
  const models = useCatalog((s) => s.models)
  const [info, setInfo] = useState<AppInfo>()
  const [restarting, setRestarting] = useState(false)
  useEffect(() => void desktop.info().then(setInfo), [])

  return (
    <Section
      title="Backend"
      description="Models, endpoints, default permissions, the shell sandbox and memory are configured in config.yaml."
    >
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 rounded-xl border border-line px-4 py-3 text-[13px]">
        <dt className="text-fg-muted">Status</dt>
        <dd>
          <Badge tone={backend.status === 'ready' ? 'success' : backend.status === 'failed' ? 'danger' : 'warning'}>
            {backend.status}
          </Badge>
        </dd>
        <dt className="text-fg-muted">ollupi</dt>
        <dd className="font-mono text-xs leading-5">{serverVersion || '—'}</dd>
        <dt className="text-fg-muted">Models</dt>
        <dd className="font-mono text-xs leading-5">{models.map((m) => m.connection).join(', ') || '—'}</dd>
        <dt className="text-fg-muted">Data folder</dt>
        <dd className="selectable font-mono text-xs leading-5 break-all">{info?.home}</dd>
        <dt className="text-fg-muted">App</dt>
        <dd className="font-mono text-xs leading-5">{info?.version}</dd>
      </dl>
      <div className="flex gap-2">
        <Button
          icon={<RotateCw size={14} />}
          loading={restarting}
          onClick={() => {
            setRestarting(true)
            void desktop.backend.restart().finally(() => setRestarting(false))
          }}
        >
          Restart backend
        </Button>
        {info && (
          <Button icon={<FileCog size={14} />} onClick={() => void desktop.openPath(info.configPath)}>
            Open config.yaml
          </Button>
        )}
      </div>
    </Section>
  )
}

function WorkspacesSection() {
  const workspaces = useCatalog((s) => s.workspaces)
  return (
    <Section title="Workspaces" description="Project folders the agent can work in. Their permissions add to the agent defaults.">
      {workspaces.length === 0 && <p className="text-[13px] text-fg-subtle">No workspaces yet.</p>}
      <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {workspaces.map((w) => (
          <WorkspaceRowView key={w.id} workspace={w} />
        ))}
      </div>
    </Section>
  )
}

function WorkspaceRowView({ workspace }: { workspace: WorkspaceRow }) {
  const [name, setName] = useState(workspace.name)
  const archived = !!workspace.archivedAt
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          className="max-w-60"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== workspace.name && void renameWorkspace(workspace.id, name.trim())}
        />
        {archived && <Badge>archived</Badge>}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={<FolderOpen size={13} />} onClick={() => void desktop.openPath(workspace.rootPath)}>
          Reveal
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          onClick={() => void archiveWorkspace(workspace.id, !archived)}
        >
          {archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
      <div className="selectable font-mono text-xs text-fg-subtle">{workspace.rootPath}</div>
      <Disclosure summary={<span className="text-xs">Permissions</span>}>
        <PermissionEditor
          value={workspace.settings}
          inheritFrom="the agent defaults"
          onSave={(s) => updateWorkspacePermissions(workspace.id, s)}
        />
      </Disclosure>
    </div>
  )
}
