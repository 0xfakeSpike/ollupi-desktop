import { Badge, Button, Tabs } from '@ollupi/ui'
import { FileCog, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo } from '../../../../shared/ipc'
import { useConnection } from '../../gateway/connection'
import { desktop } from '../../platform/desktop'
import { McpSection } from './McpSection'
import { ModelsSection } from './ModelsSection'
import { ToolsSection } from './ToolsSection'

type Tab = 'general' | 'models' | 'mcp' | 'tools'

const tabs: { id: Tab; label: string; description: string }[] = [
  { id: 'general', label: 'General', description: 'The ollupi backend the app runs, and where its data and config.yaml live.' },
  {
    id: 'models',
    label: 'Models',
    description: 'Grouped by the API that serves them; a model is selected as provider/name. Saving checks the change with the backend, then restarts it.',
  },
  {
    id: 'mcp',
    label: 'MCP',
    description: 'MCP servers give the agent their tools as <name>__<tool>. The backend connects them at start and skips one it cannot use.',
  },
  { id: 'tools', label: 'Tools', description: 'What the agent can call. Permission rules name these tools.' },
]

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>('general')
  const current = tabs.find((t) => t.id === tab)!
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-4 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">Settings</h1>
        <Tabs<Tab> label="Settings" tabs={tabs} value={tab} onChange={setTab} />
      </header>
      <div className="flex-1 overflow-y-auto">
        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-8">
          <p className="text-xs text-fg-muted">{current.description}</p>
          {tab === 'general' && <General />}
          {tab === 'models' && <ModelsSection />}
          {tab === 'mcp' && <McpSection />}
          {tab === 'tools' && <ToolsSection />}
        </section>
      </div>
    </div>
  )
}

function General() {
  const backend = useConnection((s) => s.backend)
  const serverVersion = useConnection((s) => s.serverVersion)
  const [info, setInfo] = useState<AppInfo>()
  const [restarting, setRestarting] = useState(false)
  useEffect(() => void desktop.info().then(setInfo), [])
  const rows: [string, ReactNode][] = [
    ['Status', <Badge tone={backend.status === 'ready' ? 'success' : backend.status === 'failed' ? 'danger' : 'warning'}>{backend.status}</Badge>],
    ['ollupi', serverVersion || '—'],
    ['Data folder', info?.home],
    ['App', info?.version],
  ]
  return (
    <>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 rounded-xl border border-line px-4 py-3 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="selectable font-mono text-xs leading-5 break-all">{v}</dd>
          </div>
        ))}
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
        {info?.configPath && (
          <Button icon={<FileCog size={14} />} onClick={() => void desktop.openPath(info.configPath)}>
            Open config.yaml
          </Button>
        )}
      </div>
    </>
  )
}
