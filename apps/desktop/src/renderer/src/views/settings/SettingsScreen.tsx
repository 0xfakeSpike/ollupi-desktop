import { Badge, Button, cn, Field, palettes, Select, Tabs, type Palette } from '@ollupi/ui'
import { FileCog, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { colorSchemes, type AppInfo, type ColorScheme } from '../../../../shared/ipc'
import { setColorScheme, setPalette, useAppearance } from '../../domains/appearance'
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
      {/* The header's row is the content's column, so the tabs sit over it. */}
      <header className="drag flex h-10 shrink-0 border-b border-line">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-6 px-6">
          <h1 className="text-ui font-semibold">{m.settings.screen.title}</h1>
          <Tabs<Tab> label={m.settings.screen.title} tabs={tabs} value={tab} onChange={setTab} />
        </div>
      </header>
      <div className="scroll-centered flex-1 overflow-y-auto">
        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
          <p className="text-ui text-fg-muted">{current.description}</p>
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
      <Appearance />
      <dl className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-11 items-center gap-4 px-3 py-2.5">
            <dt className="shrink-0 text-ui text-fg">{k}</dt>
            <dd className="selectable min-w-0 flex-1 text-right font-mono text-small break-all text-fg-muted">{v ?? '—'}</dd>
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

function Appearance() {
  const { palette, scheme } = useAppearance()
  const t = useT().common.appearance
  return (
    <>
      <Field label={t.scheme}>
        <Select className="max-w-60" value={scheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
          {colorSchemes.map((s) => (
            <option key={s} value={s}>
              {t.schemes[s]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id="palette-label" className="text-ui font-medium text-fg">
          {t.palette}
        </span>
        <div role="radiogroup" aria-labelledby="palette-label" className="grid grid-cols-3 gap-2">
          {palettes.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === palette}
              onClick={() => setPalette(p)}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors duration-100 ease-standard',
                'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
                p === palette ? 'border-fg' : 'border-line hover:border-line-strong',
              )}
            >
              <Swatch palette={p} />
              <span className="px-0.5 text-small text-fg">{t.palettes[p]}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** A small window in the palette's own colours: data-palette gives this
 * element that palette's tokens, in the scheme showing now. */
function Swatch({ palette }: { palette: Palette }) {
  return (
    <div data-palette={palette} aria-hidden className="flex h-14 gap-1.5 rounded-md bg-ground p-1.5">
      <div className="flex w-4 flex-col gap-1 pt-1">
        <span className="h-1 rounded-full bg-fg/25" />
        <span className="h-1 rounded-full bg-fg/15" />
        <span className="h-1 rounded-full bg-fg/15" />
      </div>
      <div className="flex flex-1 flex-col justify-between rounded-sm border border-line bg-canvas p-1.5">
        <span className="h-1 w-3/4 rounded-full bg-fg/70" />
        <span className="h-1 w-1/2 rounded-full bg-fg/25" />
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-accent" />
          <span className="h-2 w-6 rounded-sm bg-ink" />
        </div>
      </div>
    </div>
  )
}
