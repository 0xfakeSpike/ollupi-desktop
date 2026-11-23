// Token use over the last days: the total and what it is made of, a bar per
// day, and where the tokens went by workspace, by API and by model. The engine
// counts each model call as it runs, so this page only reads.

import { formatTokens } from '@ollupi/core'
import type { UsageRow } from '@ollupi/protocol'
import { Button, Badge, Callout, cn, EmptyState, IconButton, Loader, Tabs } from '@ollupi/ui'
import { ChartColumn, RotateCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { tokensOf, useUsage, type UsageTotals } from '../../domains/usage'
import { useModels } from '../../domains/models'
import { useWorkspaces } from '../../domains/workspaces'
import { useLocale, useT } from '../../i18n'
import { workspaceName } from '../../i18n/format'
import { desktop } from '../../platform/desktop'
import { providerOf } from '../common/modelName'

const periods = [
  { id: 'd7', days: 7 },
  { id: 'd30', days: 30 },
] as const

type Period = (typeof periods)[number]['id']

export function UsageSection() {
  const m = useT()
  const t = m.settings.usage
  const [period, setPeriod] = useState<Period>('d7')
  const days = periods.find((p) => p.id === period)?.days ?? 7
  const { usage, refresh } = useUsage(days)
  const shown = usage.status === 'ready' && usage.usage.days === days ? usage.usage : undefined
  const workspaces = useWorkspaces((s) => s.list)
  // The APIs config serves now: a row of one no longer listed is still shown,
  // marked, since its tokens were used all the same.
  const served = new Set(useModels((s) => s.list).map((m) => providerOf(m.connection)))

  const workspaceLabel = (id: string) => {
    if (!id) return t.noWorkspace
    const found = workspaces.find((w) => w.id === id)
    return found ? workspaceName(m, found) : t.unknownWorkspace
  }
  const modelLabel = (row: UsageRow) => {
    if (!row.key) return t.unknownModel
    return row.provider ? `${row.provider} · ${row.key}` : row.key
  }
  const apiLabel = (row: UsageRow) => row.key || t.unknownProvider
  // Nothing is marked while the model list has not arrived yet.
  const removed = (api: string | undefined) => (api && served.size > 0 && !served.has(api) ? <Badge>{t.deletedApi}</Badge> : null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Tabs<Period>
          label={t.period}
          tabs={periods.map((p) => ({ id: p.id, label: t.periods[p.id] }))}
          value={period}
          onChange={setPeriod}
        />
        <IconButton label={m.common.reload} onClick={refresh}>
          <RotateCw size={14} />
        </IconButton>
      </div>
      {usage.status === 'offline' ? (
        <Callout tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{t.offline}</span>
            <Button size="sm" onClick={() => void desktop.backend.restart()}>
              {m.common.restartBackend}
            </Button>
          </div>
        </Callout>
      ) : usage.status === 'failed' ? (
        <Callout tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{t.failed(usage.error)}</span>
            <Button size="sm" onClick={refresh}>
              {t.retry}
            </Button>
          </div>
        </Callout>
      ) : !shown ? (
        <Loader label={t.loading} />
      ) : shown.provider.length === 0 ? (
        <EmptyState icon={<ChartColumn size={20} />} title={t.empty.title}>
          {t.empty.hint}
        </EmptyState>
      ) : (
        <>
          <Total totals={shown.totals} days={days} />
          <Card title={t.byDay}>
            <DayChart rows={shown.day} />
          </Card>
          <Card title={t.byWorkspace}>
            <Breakdown rows={shown.workspace} label={(row) => workspaceLabel(row.key)} />
          </Card>
          <Card title={t.byApi}>
            <Breakdown rows={shown.provider} label={apiLabel} mark={(row) => removed(row.key)} />
          </Card>
          <Card title={t.byModel}>
            <Breakdown rows={shown.model} label={modelLabel} mark={(row) => removed(row.provider)} />
          </Card>
          <p className="text-small text-fg-subtle">{t.note}</p>
        </>
      )}
    </div>
  )
}

/** The tokens a call sends and gets back, as the parts of one total: the
 * cached input first in a lighter step of the input's colour, then what the
 * call wrote to the cache, the rest of the input, and the output. */
function Total({ totals, days }: { totals: UsageTotals; days: number }) {
  const m = useT()
  const t = m.settings.usage
  const c = m.conversation.context
  const parts = [
    { key: 'cached', label: c.cachedInput, tokens: totals.cached, color: 'bg-chart-1/45' },
    { key: 'cacheWrite', label: c.cacheWriteInput, tokens: totals.cacheWrite, color: 'bg-chart-1/70' },
    { key: 'uncached', label: c.uncachedInput, tokens: Math.max(0, totals.input - totals.cached - totals.cacheWrite), color: 'bg-chart-1' },
    { key: 'output', label: c.output, tokens: totals.output, color: 'bg-chart-2' },
  ].filter((p) => p.tokens > 0)
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-small text-fg-muted">{t.total(days)}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-display text-fg tabular-nums">{formatTokens(totals.total)}</span>
          <span className="text-small text-fg-subtle">{t.unit}</span>
        </span>
      </div>
      <div
        className="flex h-2 gap-0.5"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatTokens(p.tokens)}`).join(', ')}
      >
        {parts.map((p) => (
          <div
            key={p.key}
            title={`${p.label} · ${formatTokens(p.tokens)}`}
            className={cn('min-w-0.5 rounded-sm', p.color)}
            style={{ width: `${(p.tokens / totals.total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={cn('size-3 shrink-0 rounded-sm', p.color)} />
            <span className="text-fg-muted">{p.label}</span>
            <span className="text-fg tabular-nums">{formatTokens(p.tokens)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One bar per day, its height the day against the busiest day in the
 * period, split into input below and output above. */
function DayChart({ rows }: { rows: UsageRow[] }) {
  const t = useT().settings.usage
  const locale = useLocale((s) => s.locale)
  const busiest = Math.max(...rows.map(tokensOf), 1)
  const step = rows.length > 7 ? 5 : 1
  const last = rows.length - 1
  const dayOf = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1)
  }
  return (
    <div className="flex items-end gap-0.5" role="img" aria-label={t.chartLabel(rows.length)}>
      {rows.map((row, i) => {
        const total = tokensOf(row)
        const height = (total / busiest) * 100
        const day = dayOf(row.key)
        const named = i === last ? t.today : null
        return (
          <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="flex h-28 w-full flex-col justify-end"
              title={`${day.toLocaleDateString(locale, { dateStyle: 'medium' })} · ${formatTokens(total)}`}
            >
              {total > 0 && (
                <div className="flex min-h-1 w-full flex-col overflow-hidden rounded-sm" style={{ height: `${height}%` }}>
                  <div className="min-h-0 bg-chart-2" style={{ flexGrow: row.outputTokens }} />
                  <div className="min-h-0 bg-chart-1" style={{ flexGrow: row.inputTokens }} />
                </div>
              )}
            </div>
            <span className="h-4 text-caption whitespace-nowrap text-fg-subtle tabular-nums">
              {named ?? (i % step === 0 || i === last ? day.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' }) : '')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Rows of a grouping, busiest first: its name, the tokens, and a bar split
 * into input and output, each row against the busiest one. A row whose calls
 * reported no tokens says so instead of a zero; mark adds what belongs beside
 * the name. */
function Breakdown({ rows, label, mark }: { rows: UsageRow[]; label: (row: UsageRow) => string; mark?: (row: UsageRow) => ReactNode }) {
  const t = useT().settings.usage
  const busiest = Math.max(...rows.map(tokensOf), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const tokens = tokensOf(row)
        const name = label(row)
        return (
          <li key={`${row.provider ?? ''}/${row.key}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="min-w-0 truncate text-ui text-fg" title={name}>
                  {name}
                </span>
                {mark?.(row)}
              </span>
              <span className="shrink-0 text-small text-fg-muted tabular-nums" title={t.calls(row.calls)}>
                {tokens === 0 && row.calls > 0 ? t.unreported : formatTokens(tokens)}
              </span>
            </div>
            <div className="flex h-1.5 gap-0.5 overflow-hidden">
              <div className="rounded-sm bg-chart-1" style={{ width: `${(row.inputTokens / busiest) * 100}%` }} />
              <div className="rounded-sm bg-chart-2" style={{ width: `${(row.outputTokens / busiest) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4">
      <h3 className="text-ui font-medium text-fg">{title}</h3>
      {children}
    </div>
  )
}
