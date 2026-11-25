import { Badge, Button, cn, Field, Select, Switch, Tabs } from '@ollupi/ui'
import { Check, FolderOpen, RotateCw, ScrollText, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { go, settingsTabs, type SettingsTab } from '../../domains/navigation'
import { NavPage } from '../common/NavPage'
import { colorSchemes, type AppInfo, type ColorScheme } from '../../../../shared/ipc'
import { setColorScheme, setTheme, themes, useAppearance, type Theme } from '../../domains/appearance'
import { clearHistory } from '../../domains/browser'
import { openPath } from '../../domains/files'
import { noticeKinds, setNotification, useNotificationPrefs } from '../../domains/notifications'
import { setRedaction, updateUserPermissions, useSettings } from '../../domains/settings'
import { useConnection } from '../../gateway/connection'
import { setLanguage, useLocale, useT, type LanguagePreference } from '../../i18n'
import { locales, systemLocale } from '../../i18n/locale'
import { desktop } from '../../platform/desktop'
import { UpdateAction, UpdateNote, UpdateProgress } from '../common/Update'
import { ModelsSection } from './ModelsSection'
import { PermissionEditor } from './PermissionEditor'
import { ProfilesSection } from './ProfilesSection'
import { RemoteSection } from './RemoteSection'
import { UsageSection } from './UsageSection'
import { Emblem } from '../common/Wolf'

const bodies: Record<SettingsTab, () => ReactNode> = {
  profiles: ProfilesSection,
  general: General,
  connection: RemoteSection,
  language: Language,
  appearance: Appearance,
  notifications: Notifications,
  models: ModelsSection,
  usage: UsageSection,
  permissions: Permissions,
  redaction: Redaction,
}

/** The settings one part at a time, as memory's scopes and the capabilities
 * are: the parts listed on the left, the chosen one beside them, saying
 * what it is for in a line above its controls. */
export function SettingsScreen({ tab }: { tab: SettingsTab }) {
  const t = useT().settings.screen
  const tabs = settingsTabs.map((id) => ({ id, label: t.sections[id].label }))
  const Body = bodies[tab]
  const description = t.sections[tab].description
  return (
    <NavPage
      title={t.title}
      nav={<Tabs<SettingsTab> label={t.title} orientation="auto" tabs={tabs} value={tab} onChange={(id) => go({ kind: 'settings', tab: id })} />}
      panel={{ role: 'tabpanel', id: `panel-${tab}`, 'aria-labelledby': `tab-${tab}` }}
    >
      {description && <p className="text-ui text-fg-muted">{description}</p>}
      <Body />
    </NavPage>
  )
}

/** Ollupi itself, its version and the one step an update allows; then one
 * row per thing the app keeps, where it is and the button that acts on it. */
function General() {
  const m = useT()
  const t = m.settings.general
  const backend = useConnection((s) => s.backend)
  const [info, setInfo] = useState<AppInfo>()
  const [restarting, setRestarting] = useState(false)
  const [visited, setVisited] = useState<number>()
  useEffect(() => void desktop.info().then(setInfo), [])
  useEffect(() => void desktop.browser.history.count().then(setVisited), [])
  const open = (path: string | undefined, icon: ReactNode) =>
    path && (
      <Button size="sm" icon={icon} onClick={() => void openPath(path)}>
        {t.open}
      </Button>
    )
  const path = (p: string | undefined) => <Path path={p} home={info?.userHome} />
  return (
    <>
      {/* About Ollupi, the one place in the settings the brand speaks, with its version. */}
      <div className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4">
        <div className="flex items-center gap-4">
          <Emblem className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-title text-fg">Ollupi</span>
              <span className="selectable font-mono text-small text-fg-muted">{info?.version}</span>
            </div>
            <div className="text-small text-fg-muted">{t.about}</div>
            <UpdateNote />
          </div>
          <UpdateAction />
        </div>
        <UpdateProgress />
      </div>
      <dl className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        <Row label={t.log} value={path(info?.backendLog)} action={open(info?.backendLog, <ScrollText size={14} />)} />
        <Row label={t.dataFolder} value={path(info?.home)} action={open(info?.home, <FolderOpen size={14} />)} />
        <Row
          label={t.browserHistory}
          value={visited === undefined ? '—' : t.pagesVisited(visited)}
          action={
            // Clearing removes something, so it reads as removing; it asks first.
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              icon={<Trash2 size={14} />}
              disabled={!visited}
              onClick={() => {
                if (confirm(t.clearHistoryConfirm)) void clearHistory().then((done) => done && setVisited(0))
              }}
            >
              {t.clearHistory}
            </Button>
          }
        />
        <Row
          label={t.status}
          value={
            // Ready is how it should be, so it is not coloured; only trouble is.
            <Badge tone={backend.status === 'ready' ? 'neutral' : backend.status === 'failed' ? 'danger' : 'warning'}>{t.backendStatus[backend.status]}</Badge>
          }
          action={
            <Button
              size="sm"
              icon={<RotateCw size={14} />}
              loading={restarting}
              onClick={() => {
                setRestarting(true)
                void desktop.backend.restart().finally(() => setRestarting(false))
              }}
            >
              {m.common.restartBackend}
            </Button>
          }
        />
      </dl>
    </>
  )
}

function Row({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-4 px-5 py-2.5">
      <dt className="w-24 shrink-0 text-ui text-fg">{label}</dt>
      <dd className="selectable min-w-0 flex-1 truncate text-small text-fg-muted">{value}</dd>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** A path from the home folder, as ~, on one line; the whole of it on hover. */
function Path({ path, home }: { path: string | undefined; home: string | undefined }) {
  if (!path) return <>—</>
  const short = home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
  return (
    <span className="font-mono" title={path}>
      {short}
    </span>
  )
}

function Language() {
  const m = useT()
  const preference = useLocale((s) => s.preference)
  return (
    <Select
      aria-label={m.settings.screen.sections.language.label}
      className="max-w-60"
      value={preference}
      onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
    >
      <option value="system">{m.common.language.system(m.common.language.names[systemLocale()])}</option>
      {locales.map((l) => (
        <option key={l} value={l}>
          {m.common.language.names[l]}
        </option>
      ))}
    </Select>
  )
}

function Notifications() {
  const t = useT().notifications.settings
  const prefs = useNotificationPrefs()
  return (
    <div className="rounded-3xl bg-surface px-5 py-4">
      <div className="flex flex-col gap-2">
        {noticeKinds.map((kind) => (
          <div key={kind} className="flex items-center gap-4">
            <span className="min-w-0 flex-1 text-ui text-fg">{t.kinds[kind]}</span>
            <Switch label={t.kinds[kind]} checked={prefs[kind]} onChange={(on) => setNotification(kind, on)} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Off until ollupi's setting is read, so it never shows a guess. */
function Redaction() {
  const t = useT().settings.general
  const settings = useSettings((s) => s.settings)
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-surface px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-ui text-fg">{t.redactionSwitch}</div>
        <div className="text-small text-fg-muted">{t.redactionNote}</div>
      </div>
      <Switch label={t.redactionSwitch} checked={settings?.redaction ?? false} disabled={!settings} onChange={(on) => void setRedaction(on)} />
    </div>
  )
}

/** The permissions every conversation starts from; a workspace and a
 * conversation add their own above them. */
function Permissions() {
  const m = useT()
  const settings = useSettings((s) => s.settings)
  if (!settings) return null
  return <PermissionEditor value={settings.permissions} inheritFrom={m.settings.permissions.fromOllupi} onSave={updateUserPermissions} />
}

function Appearance() {
  const { scheme } = useAppearance()
  const t = useT().common.appearance
  return (
    <div className="flex flex-col gap-5">
      <ThemeChoice />
      <Field label={t.scheme}>
        <Select className="max-w-60" value={scheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
          {colorSchemes.map((s) => (
            <option key={s} value={s}>
              {t.schemes[s]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

/** The themes side by side, each shown as itself in miniature. Arrow keys
 * move between them, as in any radio group. */
function ThemeChoice() {
  const { theme } = useAppearance()
  const t = useT().common.appearance
  const label = useId()
  const group = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (themes.indexOf(theme) + step + themes.length) % themes.length
    setTheme(themes[next]!)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id={label} className="text-ui font-medium text-fg">
        {t.theme}
      </span>
      <div ref={group} role="radiogroup" aria-labelledby={label} onKeyDown={onKeyDown} className="grid max-w-xl grid-cols-2 gap-3">
        {themes.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={theme === k}
            tabIndex={theme === k ? 0 : -1}
            onClick={() => setTheme(k)}
            className={cn(
              'flex flex-col gap-2.5 rounded-3xl p-1.5 text-left transition-colors duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
              theme === k ? 'bg-selected' : 'hover:bg-hover',
            )}
          >
            <ThemePreview theme={k} />
            <span className="flex flex-col gap-0.5 px-2 pb-1.5">
              <span className="flex items-center gap-1.5 text-ui font-medium text-fg">
                {t.themes[k].name}
                {theme === k && <Check size={14} className="text-ink" aria-hidden />}
              </span>
              <span className="text-small text-fg-muted">{t.themes[k].description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A theme in miniature, drawn with its own tokens (data-theme on the
 * preview): its ground with its grain and light, a sidebar of workspace areas under the new
 * capsule, and the sheet with a message, two lines of answer and the send
 * button. */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span data-theme={theme} aria-hidden className="ground-wash flex h-28 gap-1.5 overflow-hidden rounded-2xl bg-ground p-1.5">
      <span className="flex w-1/3 flex-col gap-1 pt-2.5 pl-0.5">
        <span className="mb-0.5 h-3 w-3/4 rounded-full bg-ink" />
        <span className="h-5.5 rounded-lg bg-area-1" />
        <span className="h-5.5 rounded-lg bg-area-2" />
        <span className="h-5.5 rounded-lg bg-area-3" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 rounded-xl bg-canvas p-2 shadow-sm">
        <span className="ml-auto h-3 w-1/2 rounded-full bg-surface" />
        <span className="h-1.5 w-5/6 rounded-full bg-fg-subtle/40" />
        <span className="h-1.5 w-2/3 rounded-full bg-fg-subtle/40" />
        <span className="mt-auto flex items-center justify-between">
          <span className="h-3 w-10 rounded-full bg-accent-soft" />
          <span className="size-4 rounded-full bg-send" />
        </span>
      </span>
    </span>
  )
}
