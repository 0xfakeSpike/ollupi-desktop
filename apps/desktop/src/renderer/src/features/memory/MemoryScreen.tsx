// Long-term memory: what the agent has learned, by scope. Entries can be
// corrected (and are then protected from automatic rewrites) or forgotten.

import { relativeTime } from '@ollupi/core'
import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { Badge, Button, EmptyState, IconButton, Select, Spinner } from '@ollupi/ui'
import { Brain, Pencil, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editMemory, fetchMemory, forgetMemory, type MemoryScope } from '../../services/actions/memory'
import { useCatalog } from '../../stores/catalog'

export function MemoryScreen() {
  const workspaces = useCatalog((s) => s.workspaces)
  const [scope, setScope] = useState<MemoryScope>({ workspaceId: undefined, includeGlobal: true })
  const [data, setData] = useState<{ status: MemoryStatus; entries: MemoryRow[] }>()
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setData(await fetchMemory(scope))
    setLoading(false)
  }, [scope])
  useEffect(() => void reload(), [reload])

  const replace = (row: MemoryRow) =>
    setData((d) => d && { ...d, entries: d.entries.map((e) => (e.id === row.id ? row : e)) })
  const remove = (id: string) => setData((d) => d && { ...d, entries: d.entries.filter((e) => e.id !== id) })
  const entries = data?.entries.filter((e) => e.status === 'active') ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">Memory</h1>
        <Select
          className="h-7 w-56 text-xs"
          value={scope.workspaceId ?? ''}
          onChange={(e) => setScope({ workspaceId: e.target.value || undefined, includeGlobal: true })}
        >
          <option value="">Global</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} + global
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <IconButton label="Reload" size="sm" onClick={() => void reload()}>
          <RotateCw size={13} />
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-6">
          {data && <StatusLine status={data.status} />}
          {loading && !data ? (
            <div className="flex justify-center py-12 text-fg-subtle">
              <Spinner />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState icon={<Brain size={28} />} title="Nothing remembered yet">
              Memories are distilled from finished turns when generation is enabled in config.yaml.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {entries.map((e) => (
                <MemoryEntry
                  key={e.id}
                  entry={e}
                  workspaceName={workspaces.find((w) => w.id === e.workspaceId)?.name}
                  onSaved={replace}
                  onForgotten={() => remove(e.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusLine({ status }: { status: MemoryStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      <Badge tone={status.useEnabled ? 'success' : 'neutral'}>recall {status.useEnabled ? 'on' : 'off'}</Badge>
      <Badge tone={status.generationEnabled ? 'success' : 'neutral'}>
        learning {status.generationEnabled ? 'on' : 'off'}
      </Badge>
      <span>{status.active} active</span>
      {status.pending > 0 && <span>· {status.pending} turns waiting</span>}
      {status.lastError && <span className="text-danger">· {status.lastError}</span>}
    </div>
  )
}

function MemoryEntry({
  entry,
  workspaceName,
  onSaved,
  onForgotten,
}: {
  entry: MemoryRow
  workspaceName: string | undefined
  onSaved(row: MemoryRow): void
  onForgotten(): void
}) {
  const [editing, setEditing] = useState(false)
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
        <Badge tone={entry.workspaceId ? 'accent' : 'neutral'}>{workspaceName ?? (entry.workspaceId ? 'workspace' : 'global')}</Badge>
        {entry.userEdited && <Badge tone="success">edited</Badge>}
        <span className="text-fg-subtle">{relativeTime(entry.updatedAt)}</span>
        <div className="flex-1" />
        {!editing && (
          <div className="flex opacity-0 transition group-hover:opacity-100">
            <IconButton label="Edit" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={12} />
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
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-line-strong bg-raised px-2.5 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
          />
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
