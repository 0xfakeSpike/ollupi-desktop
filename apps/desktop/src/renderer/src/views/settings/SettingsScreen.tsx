import { Badge, Button, Field, Select, Tabs } from '@ollupi/ui'
import { FileCog, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo } from '../../../../shared/ipc'
import { useConnection } from '../../gateway/connection'
import { setLanguage, useLocale, useT, type LanguagePreference, type Messages } from '../../i18n'
import { locales, systemLocale } from '../../i18n/locale'
import { desktop } from '../../platform/desktop'
import { McpSection } from './McpSection'
import { ModelsSection } from './ModelsSection'
import { ToolsSection } from './ToolsSection'

type Tab = 'general' | 'models' | 'mcp' | 'tools'

const tabIds: Tab[] = ['general', 'models', 'mcp', 'tools']

const tabsOf = (m: Messages) => tabIds.map((id) => ({ id, ...m.settings.screen.tabs[id] }))

export function SettingsScreen() {
  const m = useT()
  const [tab, setTab] = useState<Tab>('general')
  const tabs = tabsOf(m)
  const current = tabs.find((t) => t.id === tab)!
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-4 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">{m.settings.screen.title}</h1>
        <Tabs<Tab> label={m.settings.screen.title} tabs={tabs} value={tab} onChange={setTab} />
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
  const m = useT()
  const preference = useLocale((s) => s.preference)
  const backend = useConnection((s) => s.backend)
  const serverVersion = useConnection((s) => s.serverVersion)
  const [info, setInfo] = useState<AppInfo>()
  const [restarting, setRestarting] = useState(false)
  useEffect(() => void desktop.info().then(setInfo), [])
  const rows: [string, ReactNode][] = [
    [
      m.settings.general.status,
      <Badge tone={backend.status === 'ready' ? 'success' : backend.status === 'failed' ? 'danger' : 'warning'}>
        {m.settings.general.backendStatus[backend.status]}
      </Badge>,
    ],
    ['ollupi', serverVersion || '—'],
    [m.settings.general.dataFolder, info?.home],
    [m.settings.general.app, info?.version],
  ]
  return (
    <>
      <Field label={m.common.language.label} hint={m.common.language.hint}>
        <Select className="max-w-60" value={preference} onChange={(e) => setLanguage(e.target.value as LanguagePreference)}>
          <option value="system">{m.common.language.system(m.common.language.names[systemLocale()])}</option>
          {locales.map((l) => (
            <option key={l} value={l}>
              {m.common.language.names[l]}
            </option>
          ))}
        </Select>
      </Field>
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
          {m.common.restartBackend}
        </Button>
        {info?.configPath && (
          <Button icon={<FileCog size={14} />} onClick={() => void desktop.openPath(info.configPath)}>
            {m.settings.general.openConfig}
          </Button>
        )}
      </div>
    </>
  )
}
