import { Badge, Button, cn, Field, Select, Switch } from '@ollupi/ui'
import { FileCog, FolderOpen, RotateCw, ScrollText, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { colorSchemes, type AppInfo, type ColorScheme } from '../../../../shared/ipc'
import { setColorScheme, useAppearance } from '../../domains/appearance'
import { clearHistory } from '../../domains/browser'
import { openPath } from '../../domains/files'
import { noticeKinds, setNotification, useNotificationPrefs } from '../../domains/notifications'
import { setRedaction, useSettings } from '../../domains/settings'
import { useConnection } from '../../gateway/connection'
import { setLanguage, useLocale, useT, type LanguagePreference } from '../../i18n'
import { locales, systemLocale } from '../../i18n/locale'
import { desktop } from '../../platform/desktop'
import { UpdateAction, UpdateNote, UpdateProgress } from '../common/Update'
import { FeishuSection } from './FeishuSection'
import { ModelsSection } from './ModelsSection'

/** Most used first: models are where keys, providers and balances live;
 * general, beside them, holds the version and the backend they run on;
 * redaction is switched as the work changes; what is set once comes last. */
const sections = ['models', 'general', 'redaction', 'notifications', 'feishu', 'appearance', 'language'] as const
type Section = (typeof sections)[number]

const bodies: Record<Section, () => ReactNode> = {
  general: General,
  language: Language,
  appearance: Appearance,
  notifications: Notifications,
  models: ModelsSection,
  redaction: Redaction,
  feishu: FeishuSection,
}

/** How far below the top of the page a section's heading counts as reached. */
const REACHED = 64

/** Every setting on one page, its sections listed on the left as memory's
 * scopes are. A section listed jumps into view, and the list marks the one
 * being read as the page scrolls. */
export function SettingsScreen() {
  const t = useT().settings.screen
  const page = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Section>(sections[0])
  // A jump marks its section until the person scrolls: one near the end
  // cannot reach the top, and the page would otherwise mark the last.
  const jumped = useRef<Section | undefined>(undefined)

  useEffect(() => {
    const el = page.current
    if (!el) return
    const read = () => {
      if (jumped.current) return
      const top = el.getBoundingClientRect().top
      let reached: Section = sections[0]
      for (const id of sections) {
        const heading = document.getElementById(`settings-${id}`)
        if (heading && heading.getBoundingClientRect().top - top <= REACHED) reached = id
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) reached = sections[sections.length - 1]!
      setCurrent(reached)
    }
    const release = () => {
      jumped.current = undefined
    }
    el.addEventListener('scroll', read, { passive: true })
    for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) el.addEventListener(e, release, { passive: true })
    read()
    return () => {
      el.removeEventListener('scroll', read)
      for (const e of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) el.removeEventListener(e, release)
    }
  }, [])

  const jump = (id: Section) => {
    jumped.current = id
    setCurrent(id)
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center border-b border-line pl-4">
        <h1 className="text-ui font-semibold">{t.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Its labels start under the header's title. */}
        <nav aria-label={t.title} className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line p-2">
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={id === current ? 'true' : undefined}
              onClick={() => jump(id)}
              className={cn(
                'flex h-7 w-full items-center rounded-md px-2 text-left text-ui transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
                id === current ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover',
              )}
            >
              {t.sections[id].label}
            </button>
          ))}
        </nav>
        <div ref={page} className="scroll-centered flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 pt-6 pb-16">
            {sections.map((id) => {
              const Body = bodies[id]
              return (
                <section key={id} aria-labelledby={`settings-${id}`} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 id={`settings-${id}`} className="scroll-mt-6 text-ui font-semibold text-fg">
                      {t.sections[id].label}
                    </h2>
                    {t.sections[id].description && <p className="text-small text-fg-muted">{t.sections[id].description}</p>}
                  </div>
                  <Body />
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One row per thing the app keeps: its value, and the button that acts on it. */
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
  return (
    <dl className="flex flex-col divide-y divide-line rounded-lg border border-line">
      <Row label={t.version} value={<span className="font-mono">{info?.version ?? '—'}</span>} note={<UpdateNote />} action={<UpdateAction />}>
        <UpdateProgress />
      </Row>
      <Row label={t.log} value={<Path path={info?.backendLog} />} action={open(info?.backendLog, <ScrollText size={14} />)} />
      <Row label={t.dataFolder} value={<Path path={info?.home} />} action={open(info?.home, <FolderOpen size={14} />)} />
      <Row label="config.yaml" value={<Path path={info?.configPath} />} action={open(info?.configPath, <FileCog size={14} />)} />
      <Row
        label={t.browserHistory}
        value={visited === undefined ? '—' : t.pagesVisited(visited)}
        action={
          <Button
            size="sm"
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
          <Badge tone={backend.status === 'ready' ? 'success' : backend.status === 'failed' ? 'danger' : 'warning'}>{t.backendStatus[backend.status]}</Badge>
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
  )
}

function Row({ label, value, note, action, children }: { label: string; value: ReactNode; note?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex min-h-7 items-center gap-4">
        <dt className="w-24 shrink-0 text-ui text-fg">{label}</dt>
        <dd className="min-w-0 flex-1">
          <div className="selectable text-small break-all text-fg-muted">{value}</div>
          {note}
        </dd>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}

function Path({ path }: { path: string | undefined }) {
  return <span className="font-mono">{path || '—'}</span>
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
    <div className="rounded-lg border border-line px-4 py-4">
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
    <div className="flex items-center gap-4 rounded-lg border border-line px-4 py-3">
      <span className="min-w-0 flex-1 text-ui text-fg">{t.redactionSwitch}</span>
      <Switch label={t.redactionSwitch} checked={settings?.redaction ?? false} disabled={!settings} onChange={(on) => void setRedaction(on)} />
    </div>
  )
}

function Appearance() {
  const { scheme } = useAppearance()
  const t = useT().common.appearance
  return (
    <Field label={t.scheme}>
      <Select className="max-w-60" value={scheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
        {colorSchemes.map((s) => (
          <option key={s} value={s}>
            {t.schemes[s]}
          </option>
        ))}
      </Select>
    </Field>
  )
}
