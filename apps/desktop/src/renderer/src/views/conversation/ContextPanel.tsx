// The context window as the thread's model calls used it, from the stats
// ollupi records on each call: how full the last prompt was and what filled
// it (a part opens into its details where ollupi reports them, as for the
// memory snapshot), where compaction starts, what that call cost, and how
// the prompt grew call by call.

import {
  contextUse,
  formatTokens,
  latestContextCall,
  modelCalls,
  promptMemory,
  type ContextUse,
  type MemorySection,
  type ModelCall,
  type PromptMemory,
  type Timeline,
} from '@ollupi/core'
import { cn, IconButton } from '@ollupi/ui'
import { ChevronRight, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toggleContextPanel } from '../../domains/navigation'
import { useLocale, useT } from '../../i18n'

// Labels are the catalog's context.parts, by key, in the order ollupi builds
// the prompt: the system prompt, the tool definitions sent with it, then the
// messages, which open with the memory snapshot. Each part keeps its own
// chart colour, assigned so neighbours in this order stay apart for
// colour-blind readers; one holding less than COLOURED_SHARE of the prompt
// is too thin to find in the bar and shows gray.
const parts: { key: 'system' | 'tools' | 'messages' | 'memory'; color: string }[] = [
  { key: 'system', color: 'bg-chart-2' },
  { key: 'tools', color: 'bg-chart-3' },
  { key: 'memory', color: 'bg-chart-4' },
  { key: 'messages', color: 'bg-chart-1' },
]
const COLOURED_SHARE = 0.05
const SMALL = 'bg-fg/30'
const FREE = 'bg-fg/10'

export function ContextPanel({ timeline }: { timeline: Timeline | undefined }) {
  const calls = timeline ? modelCalls(timeline) : []
  const latest = latestContextCall(calls)
  const memory = timeline && latest ? promptMemory(timeline, latest) : undefined
  const t = useT().conversation.context
  const connection = (c: ModelCall) => timeline?.turns.find((t) => t.id === c.turnId)?.model.connection ?? c.stats.model ?? ''

  return (
    <aside className="my-2 mr-2 flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <h2 className="text-ui font-semibold">{t.title}</h2>
        <IconButton label={t.close} size="sm" onClick={toggleContextPanel}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!latest ? (
          <p className="text-small text-fg-subtle">{t.empty}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <Overview
              use={contextUse(latest.stats)}
              details={{ memory: memory && <MemoryDetails memory={memory} inWorkspace={!!timeline?.thread.workspaceId} /> }}
            />
            {latest.usage && <LastCall call={latest} />}
            <History calls={calls} connection={connection} partial={!!timeline?.hasMore} />
          </div>
        )}
      </div>
    </aside>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-small font-medium text-fg-muted">{title}</h3>
      {children}
      {hint && <p className="text-small text-fg-subtle">{hint}</p>}
    </section>
  )
}

const percent = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)
/** A share to one decimal, for the parts of a prompt. */
const share = (n: number, of: number) => `${of > 0 ? ((n / of) * 100).toFixed(1) : '0.0'}%`

type Part = (typeof parts)[number]['key']

interface Segment {
  key: string
  label: string
  tokens: number
  color: string
}

/** Parts of one total as a bar, in order; `rest` fills what is left. The
 * segments sit 2px apart so neighbours read apart without relying on hue. */
function Segments({ segments, of, label, rest }: { segments: Segment[]; of: number; label: string; rest?: Segment }) {
  return (
    <div className="flex h-2 gap-0.5" role="img" aria-label={label}>
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.label} · ${formatTokens(s.tokens)}`}
          className={cn('min-w-0.5 rounded-sm', s.color)}
          style={{ width: `${(s.tokens / of) * 100}%` }}
        />
      ))}
      {rest && rest.tokens > 0 && <div title={`${rest.label} · ${formatTokens(rest.tokens)}`} className={cn('min-w-0 flex-1 rounded-sm', rest.color)} />}
    </div>
  )
}

function Overview({ use, details }: { use: ContextUse; details: Partial<Record<Part, ReactNode>> }) {
  const t = useT().conversation.context
  const present = parts.filter((p) => use[p.key] > 0)
  const colorOf = (p: (typeof parts)[number]) => (use[p.key] >= use.used * COLOURED_SHARE ? p.color : SMALL)
  const free = Math.max(0, use.budget - use.used)
  return (
    <Section title={t.lastPrompt} hint={t.lastPromptHint(use.calibrated)}>
      <div className="flex items-baseline justify-between">
        <span className="text-display text-fg tabular-nums">{percent(use.used, use.budget)}%</span>
        <span className="text-small text-fg-muted tabular-nums">
          {formatTokens(use.used)} / {formatTokens(use.budget)}
        </span>
      </div>
      <div className="relative">
        <Segments
          segments={present.map((p) => ({ key: p.key, label: t.parts[p.key], tokens: use[p.key], color: colorOf(p) }))}
          of={Math.max(use.budget, use.used)}
          label={t.windowUsed(percent(use.used, use.budget))}
          rest={{ key: 'free', label: t.free, tokens: free, color: FREE }}
        />
        <CompactMark at={use.compactAt} of={use.budget} className="-top-1 h-4" />
      </div>
      <div className="relative h-3.5">
        <span
          className="absolute text-small whitespace-nowrap text-fg-subtle"
          style={{
            left: `${Math.min(100, (use.compactAt / use.budget) * 100)}%`,
            transform: use.compactAt / use.budget > 0.85 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}
        >
          {t.autoCompact}
        </span>
      </div>
      <ul className="flex flex-col">
        {present.map((p) => (
          <PartRow key={p.key} label={t.parts[p.key]} color={colorOf(p)} tokens={use[p.key]} budget={use.budget} details={details[p.key]} />
        ))}
        <PartRow label={t.free} color={FREE} tokens={free} budget={use.budget} details={undefined} />
      </ul>
    </Section>
  )
}

/** One part of the prompt; with details, a click opens them under it. */
function PartRow({ label, color, tokens, budget, details }: { label: string; color: string; tokens: number; budget: number; details: ReactNode }) {
  const [open, setOpen] = useState(false)
  const row = (
    <>
      <span className={cn('size-3.5 shrink-0 rounded-sm', color)} />
      <span className="flex flex-1 items-center gap-1 text-fg">
        {label}
        {details && <ChevronRight size={14} className={cn('text-fg-subtle transition-transform duration-160 ease-standard', open && 'rotate-90')} />}
      </span>
      <span className="text-fg-subtle tabular-nums">{formatTokens(tokens)}</span>
      <span className="w-12 text-right text-fg tabular-nums">{share(tokens, budget)}</span>
    </>
  )
  if (!details) return <li className="flex h-7 items-center gap-2 text-ui">{row}</li>
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-mx-1.5 flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-ui transition-colors duration-100 ease-standard hover:bg-hover"
      >
        {row}
      </button>
      {open && <div className="my-1.5 ml-0.5 flex flex-col gap-3 border-l border-line pl-3">{details}</div>}
    </li>
  )
}

/** What the call sent and got back, as the API reported it. The cached
 * input is the prompt's leading part, so it comes first, in a lighter step
 * of the input's colour. */
function LastCall({ call }: { call: ModelCall }) {
  const u = call.usage!
  const t = useT().conversation.context
  const segments: Segment[] = [
    { key: 'cached', label: t.cachedInput, tokens: u.cachedInputTokens, color: 'bg-chart-1/45' },
    { key: 'uncached', label: t.uncachedInput, tokens: Math.max(0, u.inputTokens - u.cachedInputTokens), color: 'bg-chart-1' },
    { key: 'output', label: t.output, tokens: u.outputTokens, color: 'bg-chart-2' },
  ].filter((s) => s.tokens > 0)
  return (
    <Section title={t.lastCall} hint={t.lastCallHint}>
      <Segments segments={segments} of={u.inputTokens + u.outputTokens} label={segments.map((s) => `${s.label} ${formatTokens(s.tokens)}`).join(', ')} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn('size-3 shrink-0 rounded-sm', s.color)} />
            <span className="text-fg-muted">{s.label}</span>
            <span className="text-fg tabular-nums">{formatTokens(s.tokens)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** The memory snapshot the call carried, by section: global, and the
 * thread's own scope, its workspace or general without one. */
function MemoryDetails({ memory, inWorkspace }: { memory: PromptMemory; inWorkspace: boolean }) {
  const m = useT().conversation
  return (
    <>
      {memory.global && <MemoryList title={m.memoryScope.global} section={memory.global} />}
      {memory.local && <MemoryList title={m.memoryScope[inWorkspace ? 'workspace' : 'general']} section={memory.local} />}
      <p className="text-small text-fg-subtle">{m.context.memoryNote}</p>
    </>
  )
}

function MemoryList({ title, section }: { title: string; section: MemorySection }) {
  const n = section.ids.length
  const t = useT().conversation.context
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-small text-fg-subtle">
        <span>
          {title} · {n}
        </span>
        <span className="tabular-nums">{formatTokens(section.tokens)}</span>
      </div>
      {section.entries ? (
        <ul className="selectable flex flex-col gap-1.5 text-small text-fg-muted">
          {section.entries.map((m) => (
            <li key={m.id} className="line-clamp-3">
              {m.topic && <span className="font-medium text-fg">{m.topic}: </span>}
              {m.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-fg-subtle">{t.memoryUnloaded}</p>
      )}
    </div>
  )
}

function History({ calls, connection, partial }: { calls: ModelCall[]; connection(c: ModelCall): string; partial: boolean }) {
  const t = useT().conversation.context
  const locale = useLocale((s) => s.locale)
  return (
    <Section title={t.modelCalls(calls.length)} hint={partial ? t.partial : undefined}>
      <ol className="flex flex-col gap-1.5">
        {calls
          .slice()
          .reverse()
          .map((c) => {
            const use = contextUse(c.stats)
            return (
              <li key={c.itemId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-small">
                  <span className="text-fg-subtle tabular-nums">{new Date(c.startedAt).toLocaleTimeString(locale)}</span>
                  <span className={cn('min-w-0 flex-1 truncate', c.kind === 'failed' ? 'text-danger' : 'text-fg-muted')}>
                    {c.kind === 'compaction' ? t.compaction : c.kind === 'failed' ? t.failed : connection(c)}
                  </span>
                  <span className="text-fg tabular-nums">{formatTokens(use.used)}</span>
                  <span className="w-8 text-right text-fg-subtle tabular-nums">{percent(use.used, use.budget)}%</span>
                </div>
                <div className="relative">
                  <div className="h-1 overflow-hidden rounded-full bg-hover">
                    <div
                      className={cn('h-full', c.kind === 'compaction' ? 'bg-warning' : c.kind === 'failed' ? 'bg-danger' : 'bg-fg/35')}
                      style={{ width: `${Math.min(100, percent(use.used, use.budget))}%` }}
                    />
                  </div>
                  <CompactMark at={use.compactAt} of={use.budget} className="-top-0.5 h-2" />
                </div>
              </li>
            )
          })}
      </ol>
    </Section>
  )
}

/** Where compaction starts on a bar of the input budget. */
function CompactMark({ at, of, className }: { at: number; of: number; className: string }) {
  const t = useT().conversation.context
  return (
    <div
      title={t.autoCompactAt(formatTokens(at))}
      className={cn('absolute w-0.5 -translate-x-1/2 rounded-full bg-fg-muted', className)}
      style={{ left: `${Math.min(100, (at / of) * 100)}%` }}
    />
  )
}
