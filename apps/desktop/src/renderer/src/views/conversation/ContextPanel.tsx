// The context window as the thread's model calls used it, from the stats
// ollupi records on each call: how full the last prompt was and what filled
// it, where compaction starts, what that call cost, the memory snapshot it
// carried, and how the prompt grew call by call.

import {
  contextUse,
  formatTokens,
  latestContextCall,
  modelCalls,
  promptMemory,
  type ContextUse,
  type MemorySection,
  type ModelCall,
  type Timeline,
} from '@ollupi/core'
import { cn, IconButton } from '@ollupi/ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { toggleContextPanel } from '../../domains/navigation'

const parts: { key: 'system' | 'tools' | 'messages' | 'memory'; label: string; color: string }[] = [
  { key: 'system', label: 'System prompt', color: 'bg-fg-subtle' },
  { key: 'tools', label: 'Tool definitions', color: 'bg-accent/45' },
  { key: 'messages', label: 'Messages', color: 'bg-accent' },
  { key: 'memory', label: 'Memory', color: 'bg-warning' },
]

export function ContextPanel({ timeline }: { timeline: Timeline | undefined }) {
  const calls = timeline ? modelCalls(timeline) : []
  const latest = latestContextCall(calls)
  const connection = (c: ModelCall) => timeline?.turns.find((t) => t.id === c.turnId)?.model.connection ?? c.stats.model ?? ''

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-canvas">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <h2 className="text-[13px] font-semibold">Context</h2>
        <IconButton label="Close context" size="sm" onClick={toggleContextPanel}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!latest ? (
          <p className="text-xs text-fg-subtle">No model calls yet. The context shows here after the first one.</p>
        ) : (
          <div className="flex flex-col gap-6">
            <Overview use={contextUse(latest.stats)} connection={connection(latest)} />
            {latest.usage && <LastCall call={latest} />}
            <Memories timeline={timeline!} call={latest} />
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
      <h3 className="text-xs font-medium text-fg-muted">{title}</h3>
      {children}
      {hint && <p className="text-[11px] leading-4 text-fg-subtle">{hint}</p>}
    </section>
  )
}

const percent = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)

function Overview({ use, connection }: { use: ContextUse; connection: string }) {
  return (
    <Section
      title="Last prompt"
      hint={`Estimated by ollupi${use.calibrated ? ', calibrated to the token count the API reported' : ''}.${use.compactAt ? ' Above auto-compact, ollupi summarizes earlier context when it can.' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-fg tabular-nums">{percent(use.used, use.budget)}%</span>
        <span className="text-xs text-fg-muted tabular-nums">
          {formatTokens(use.used)} / {formatTokens(use.budget)}
        </span>
      </div>
      <div className="relative">
        <div className="flex h-2 overflow-hidden rounded-full bg-hover" role="img" aria-label={`${percent(use.used, use.budget)}% of the context window`}>
          {parts.map((p) => (
            <div key={p.key} className={p.color} style={{ width: `${(use[p.key] / Math.max(use.budget, use.used)) * 100}%` }} />
          ))}
        </div>
        {use.compactAt && <CompactMark at={use.compactAt} of={use.budget} className="-top-1 h-4" />}
      </div>
      {use.compactAt && (
        <div className="relative h-3.5">
          <span
            className="absolute text-[10px] whitespace-nowrap text-fg-subtle"
            style={{
              left: `${Math.min(100, (use.compactAt / use.budget) * 100)}%`,
              transform: use.compactAt / use.budget > 0.85 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            Auto-compact
          </span>
        </div>
      )}
      <div className="selectable font-mono text-[11px] text-fg-subtle">{connection}</div>
      <ul className="flex flex-col gap-1">
        {parts.map((p) =>
          p.key === 'memory' && use.memory === 0 ? null : (
            <li key={p.key} className="flex items-center gap-2 text-xs">
              <span className={cn('size-2 rounded-sm', p.color)} />
              <span className="flex-1 text-fg-muted">{p.label}</span>
              <span className="text-fg tabular-nums">{formatTokens(use[p.key])}</span>
              <span className="w-9 text-right text-fg-subtle tabular-nums">{percent(use[p.key], use.budget)}%</span>
            </li>
          ),
        )}
        <li className="flex items-center gap-2 text-xs">
          <span className="size-2 rounded-sm bg-hover" />
          <span className="flex-1 text-fg-muted">Free</span>
          <span className="text-fg tabular-nums">{formatTokens(Math.max(0, use.budget - use.used))}</span>
          <span className="w-9 text-right text-fg-subtle tabular-nums">{percent(Math.max(0, use.budget - use.used), use.budget)}%</span>
        </li>
        {use.compactAt && (
          <li className="flex items-center gap-2 text-xs">
            <span className="flex size-2 justify-center">
              <span className="h-2.5 w-0.5 rounded-full bg-fg-muted" />
            </span>
            <span className="flex-1 text-fg-muted">Auto-compact at</span>
            <span className="text-fg tabular-nums">{formatTokens(use.compactAt)}</span>
            <span className="w-9 text-right text-fg-subtle tabular-nums">{percent(use.compactAt, use.budget)}%</span>
          </li>
        )}
      </ul>
    </Section>
  )
}

function LastCall({ call }: { call: ModelCall }) {
  const u = call.usage!
  return (
    <Section title="Last call" hint="As the API reported it. Cached input is the part served from the provider's prompt cache.">
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-xs">
        <dt className="text-fg-muted">Input</dt>
        <dd className="text-fg tabular-nums">{formatTokens(u.inputTokens)}</dd>
        <dt className="pl-3 text-fg-subtle">cached</dt>
        <dd className="text-fg-subtle tabular-nums">
          {formatTokens(u.cachedInputTokens)} · {percent(u.cachedInputTokens, u.inputTokens)}%
        </dd>
        <dt className="text-fg-muted">Output</dt>
        <dd className="text-fg tabular-nums">{formatTokens(u.outputTokens)}</dd>
      </dl>
    </Section>
  )
}

function Memories({ timeline, call }: { timeline: Timeline; call: ModelCall }) {
  const memory = promptMemory(timeline, call)
  if (!memory) return null
  return (
    <Section
      title="Memory in this prompt"
      hint="Loaded when the conversation started and again after each compaction. The agent searches the rest with memory_search."
    >
      {memory.global && <MemoryList title="Global" section={memory.global} />}
      {memory.workspace && <MemoryList title="This workspace" section={memory.workspace} />}
    </Section>
  )
}

function MemoryList({ title, section }: { title: string; section: MemorySection }) {
  const n = section.ids.length
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[11px] text-fg-subtle">
        <span>
          {title} · {n}
        </span>
        <span className="tabular-nums">{formatTokens(section.tokens)}</span>
      </div>
      {section.entries ? (
        <ul className="selectable flex flex-col gap-1.5 text-xs text-fg-muted">
          {section.entries.map((m) => (
            <li key={m.id} className="line-clamp-3">
              {m.topic && <span className="font-medium text-fg">{m.topic}: </span>}
              {m.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">Loaded in an earlier part of the conversation; scroll up to load it.</p>
      )}
    </div>
  )
}

function History({ calls, connection, partial }: { calls: ModelCall[]; connection(c: ModelCall): string; partial: boolean }) {
  return (
    <Section title={`Model calls · ${calls.length}`} hint={partial ? 'Only calls in the loaded part of the thread are listed.' : undefined}>
      <ol className="flex flex-col gap-1.5">
        {calls
          .slice()
          .reverse()
          .map((c) => {
            const use = contextUse(c.stats)
            return (
              <li key={c.itemId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-fg-subtle tabular-nums">{new Date(c.startedAt).toLocaleTimeString()}</span>
                  <span className={cn('min-w-0 flex-1 truncate', c.kind === 'failed' ? 'text-danger' : 'text-fg-muted')}>
                    {c.kind === 'compaction' ? 'Summarized earlier context' : c.kind === 'failed' ? 'Failed' : connection(c)}
                  </span>
                  <span className="text-fg tabular-nums">{formatTokens(use.used)}</span>
                  <span className="w-8 text-right text-fg-subtle tabular-nums">{percent(use.used, use.budget)}%</span>
                </div>
                <div className="relative">
                  <div className="h-1 overflow-hidden rounded-full bg-hover">
                    <div
                      className={cn('h-full', c.kind === 'compaction' ? 'bg-warning' : c.kind === 'failed' ? 'bg-danger' : 'bg-accent')}
                      style={{ width: `${Math.min(100, percent(use.used, use.budget))}%` }}
                    />
                  </div>
                  {use.compactAt && <CompactMark at={use.compactAt} of={use.budget} className="-top-0.5 h-2" />}
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
  return (
    <div
      title={`Auto-compact at ${formatTokens(at)}`}
      className={cn('absolute w-0.5 -translate-x-1/2 rounded-full bg-fg-muted', className)}
      style={{ left: `${Math.min(100, (at / of) * 100)}%` }}
    />
  )
}
