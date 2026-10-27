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

// Labels are the catalog's context.parts, by key. Steps of ink tell the
// fixed parts apart; the conversation itself, the part that grows, is the
// one in accent.
const parts: { key: 'system' | 'tools' | 'messages' | 'memory'; color: string }[] = [
  { key: 'system', color: 'bg-fg/25' },
  { key: 'tools', color: 'bg-fg/45' },
  { key: 'messages', color: 'bg-accent' },
  { key: 'memory', color: 'bg-fg/70' },
]

export function ContextPanel({ timeline }: { timeline: Timeline | undefined }) {
  const calls = timeline ? modelCalls(timeline) : []
  const latest = latestContextCall(calls)
  const memory = timeline && latest ? promptMemory(timeline, latest) : undefined
  const t = useT().conversation.context
  const connection = (c: ModelCall) => timeline?.turns.find((t) => t.id === c.turnId)?.model.connection ?? c.stats.model ?? ''

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-canvas">
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
              connection={connection(latest)}
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

type Part = (typeof parts)[number]['key']

function Overview({ use, connection, details }: { use: ContextUse; connection: string; details: Partial<Record<Part, ReactNode>> }) {
  const t = useT().conversation.context
  return (
    <Section title={t.lastPrompt} hint={t.lastPromptHint(use.calibrated)}>
      <div className="flex items-baseline justify-between">
        <span className="text-display text-fg tabular-nums">{percent(use.used, use.budget)}%</span>
        <span className="text-small text-fg-muted tabular-nums">
          {formatTokens(use.used)} / {formatTokens(use.budget)}
        </span>
      </div>
      <div className="relative">
        <div className="flex h-2 overflow-hidden rounded-full bg-hover" role="img" aria-label={t.windowUsed(percent(use.used, use.budget))}>
          {parts.map((p) => (
            <div key={p.key} className={p.color} style={{ width: `${(use[p.key] / Math.max(use.budget, use.used)) * 100}%` }} />
          ))}
        </div>
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
      <div className="selectable font-mono text-small text-fg-subtle">{connection}</div>
      <ul className="flex flex-col gap-1">
        {parts.map((p) =>
          p.key === 'memory' && use.memory === 0 ? null : (
            <PartRow key={p.key} label={t.parts[p.key]} color={p.color} tokens={use[p.key]} budget={use.budget} details={details[p.key]} />
          ),
        )}
        <li className="flex items-center gap-2 text-small">
          <span className="size-2 rounded-sm bg-hover" />
          <span className="flex-1 text-fg-muted">{t.free}</span>
          <span className="text-fg tabular-nums">{formatTokens(Math.max(0, use.budget - use.used))}</span>
          <span className="w-9 text-right text-fg-subtle tabular-nums">{percent(Math.max(0, use.budget - use.used), use.budget)}%</span>
        </li>
      </ul>
    </Section>
  )
}

/** One part of the prompt; with details, a click opens them under it. */
function PartRow({ label, color, tokens, budget, details }: { label: string; color: string; tokens: number; budget: number; details: ReactNode }) {
  const [open, setOpen] = useState(false)
  const row = (
    <>
      <span className={cn('size-2 shrink-0 rounded-sm', color)} />
      <span className="flex flex-1 items-center gap-1 text-fg-muted">
        {label}
        {details && <ChevronRight size={14} className={cn('text-fg-subtle transition-transform duration-160 ease-standard', open && 'rotate-90')} />}
      </span>
      <span className="text-fg tabular-nums">{formatTokens(tokens)}</span>
      <span className="w-9 text-right text-fg-subtle tabular-nums">{percent(tokens, budget)}%</span>
    </>
  )
  if (!details) return <li className="flex items-center gap-2 text-small">{row}</li>
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 text-left text-small transition-colors duration-100 ease-standard hover:bg-hover"
      >
        {row}
      </button>
      {open && <div className="my-1.5 ml-0.5 flex flex-col gap-3 border-l border-line pl-3">{details}</div>}
    </li>
  )
}

function LastCall({ call }: { call: ModelCall }) {
  const u = call.usage!
  const t = useT().conversation.context
  return (
    <Section title={t.lastCall} hint={t.lastCallHint}>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-small">
        <dt className="text-fg-muted">{t.input}</dt>
        <dd className="text-right text-fg tabular-nums">{formatTokens(u.inputTokens)}</dd>
        <dt className="pl-3 text-fg-subtle">{t.cached}</dt>
        <dd className="text-right text-fg-subtle tabular-nums">
          {formatTokens(u.cachedInputTokens)} · {percent(u.cachedInputTokens, u.inputTokens)}%
        </dd>
        <dt className="text-fg-muted">{t.output}</dt>
        <dd className="text-right text-fg tabular-nums">{formatTokens(u.outputTokens)}</dd>
      </dl>
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
