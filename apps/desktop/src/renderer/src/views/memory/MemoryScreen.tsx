// Long-term memory by scope: global, general (conversations outside any
// workspace) and each workspace. Entries can be corrected (ollupi then
// keeps extraction from rewriting them), moved to the scope they belong
// in, or forgotten.

import { relativeTime } from '@ollupi/core'
import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { Badge, Button, EmptyState, IconButton, Select, Spinner, Tabs, Textarea } from '@ollupi/ui'
import { ArrowRightLeft, Brain, Pencil, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editMemory, forgetMemory, moveMemory, placeKey, placeOf, readMemory, type MemoryPlace, type MemoryScopes } from '../../domains/memory'
import { useWorkspaces } from '../../domains/workspaces'
import { useConnection } from '../../gateway/connection'
import { MemorySettings } from './MemorySettings'

/** The places a memory can be in, as the list names them. */
function placesOf(workspaces: { id: string; name: string }[]): { place: MemoryPlace; label: string }[] {
  return [
    { place: { scope: 'global' }, label: 'Global' },
    { place: { scope: 'general' }, label: 'No workspace' },
    ...workspaces.map((w) => ({ place: { scope: 'workspace' as const, workspaceId: w.id }, label: w.name })),
  ]
}

export function MemoryScreen() {
  const workspaces = useWorkspaces((s) => s.list)
  const [scope, setScope] = useState('global')
  const [data, setData] = useState<{ status: MemoryStatus; scopes: MemoryScopes }>()
  const [loading, setLoading] = useState(true)
  const workspaceIds = workspaces.map((w) => w.id).join('\n')

  // Saving the memory settings restarts the backend: read again once the
  // new one is connected.
  const connected = useConnection((s) => s.gateway === 'connected')
  const reload = useCallback(async () => {
    setLoading(true)
    setData(await readMemory(workspaceIds ? workspaceIds.split('\n') : []))
    setLoading(false)
  }, [workspaceIds])
  useEffect(() => {
    if (connected) void reload()
  }, [reload, connected])

  const update = (change: (rows: MemoryRow[]) => MemoryRow[]) =>
    setData((d) => d && { ...d, scopes: new Map([...d.scopes].map(([k, rows]) => [k, change(rows)])) })
  const replace = (row: MemoryRow) => update((rows) => rows.map((e) => (e.id === row.id ? row : e)))
  const remove = (id: string) => update((rows) => rows.filter((e) => e.id !== id))
  const moved = (row: MemoryRow) =>
    setData((d) => {
      if (!d) return d
      const to = placeKey(placeOf(row))
      return { ...d, scopes: new Map([...d.scopes].map(([k, rows]) => [k, [...rows.filter((e) => e.id !== row.id), ...(k === to ? [row] : [])]])) }
    })
  const places = placesOf(workspaces)

  // memory/list returns every status; only active memories are used.
  const activeIn = (key: string) => data?.scopes.get(key)?.filter((e) => e.status === 'active') ?? []
  const active = activeIn(scope)
  const scopes = places.map((p) => ({ id: placeKey(p.place), label: p.label, detail: data && String(activeIn(placeKey(p.place)).length) }))
  const elsewhere = [...(data?.scopes.keys() ?? [])].some((k) => k !== scope && activeIn(k).length > 0)

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">Memory</h1>
        <div className="flex-1" />
        <IconButton label="Reload" size="sm" onClick={() => void reload()}>
          <RotateCw size={13} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-line p-3">
          <Tabs label="Scope" orientation="vertical" tabs={scopes} value={scope} onChange={setScope} />
        </nav>
        <div role="tabpanel" id={`panel-${scope}`} aria-labelledby={`tab-${scope}`} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-6">
            <MemorySettings status={data?.status} />
            {data && <StatusLine status={data.status} />}
            {loading && !data ? (
              <div className="flex justify-center py-12 text-fg-subtle">
                <Spinner />
              </div>
            ) : active.length === 0 ? (
              elsewhere ? (
                <EmptyState icon={<Brain size={28} />} title="Nothing remembered in this scope">
                  Memories are kept globally, for conversations outside workspaces, or per workspace; other scopes have some. Choose one on the left.
                </EmptyState>
              ) : (
                <EmptyState icon={<Brain size={28} />} title="Nothing remembered yet">
                  Memories are distilled from finished turns while learning is on.
                </EmptyState>
              )
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                {active.map((e) => (
                  <Entry
                    key={e.id}
                    entry={e}
                    places={places.filter((p) => placeKey(p.place) !== scope)}
                    onSaved={replace}
                    onMoved={moved}
                    onForgotten={() => remove(e.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusLine({ status }: { status: MemoryStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      <Badge tone={status.useEnabled ? 'success' : 'neutral'}>{status.useEnabled ? 'used in conversations' : 'not used in conversations'}</Badge>
      <Badge tone={status.generationEnabled ? 'success' : 'neutral'}>learning {status.generationEnabled ? 'on' : 'off'}</Badge>
      <span>{status.active} active</span>
      {status.generationEnabled && status.pending > 0 && <span>· {status.pending} turns to learn from</span>}
      {status.lastError && <span className="text-danger">· {status.lastError}</span>}
    </div>
  )
}

function Entry({
  entry,
  places,
  onSaved,
  onMoved,
  onForgotten,
}: {
  entry: MemoryRow
  /** Where it can be moved to. */
  places: { place: MemoryPlace; label: string }[]
  onSaved(row: MemoryRow): void
  onMoved(row: MemoryRow): void
  onForgotten(): void
}) {
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [text, setText] = useState(entry.text)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const row = await editMemory(entry.id, text)
    setBusy(false)
    if (row) {
      onSaved(row)
      setEditing(false)
    }
  }

  return (
    <li className="group flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-fg">{entry.topic}</span>
        <Badge>{entry.kind}</Badge>
        {entry.userEdited && <Badge tone="success">edited by you</Badge>}
        <span className="text-fg-subtle">{relativeTime(entry.updatedAt)}</span>
        <div className="flex-1" />
        {!editing && !moving && (
          <div className="flex opacity-0 transition group-hover:opacity-100">
            <IconButton label="Edit" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={12} />
            </IconButton>
            <IconButton label="Move to another scope" size="sm" onClick={() => setMoving(true)}>
              <ArrowRightLeft size={12} />
            </IconButton>
            <IconButton
              label="Forget"
              size="sm"
              onClick={() => {
                if (confirm('Forget this memory?')) void forgetMemory(entry.id).then((ok) => ok && onForgotten())
              }}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        )}
      </div>
      {moving && (
        <MoveTo
          places={places}
          onCancel={() => setMoving(false)}
          onMove={async (to) => {
            const row = await moveMemory(entry.id, to)
            if (row) onMoved(row)
          }}
        />
      )}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="selectable text-[13px] leading-6 whitespace-pre-wrap text-fg-muted">{entry.text}</p>
      )}
    </li>
  )
}

/** Picks the place a memory belongs in. */
function MoveTo({
  places,
  onCancel,
  onMove,
}: {
  places: { place: MemoryPlace; label: string }[]
  onCancel(): void
  onMove(to: MemoryPlace): Promise<void>
}) {
  const [to, setTo] = useState(places[0] && placeKey(places[0].place))
  const [busy, setBusy] = useState(false)
  const target = places.find((p) => placeKey(p.place) === to)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-muted">Move to</span>
      <Select aria-label="Scope to move to" className="h-7 w-56 text-xs" value={to} onChange={(e) => setTo(e.target.value)}>
        {places.map((p) => (
          <option key={placeKey(p.place)} value={placeKey(p.place)}>
            {p.label}
          </option>
        ))}
      </Select>
      <div className="flex-1" />
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={!target}
        loading={busy}
        onClick={() => {
          if (!target) return
          setBusy(true)
          void onMove(target.place).finally(() => setBusy(false))
        }}
      >
        Move
      </Button>
    </div>
  )
}
