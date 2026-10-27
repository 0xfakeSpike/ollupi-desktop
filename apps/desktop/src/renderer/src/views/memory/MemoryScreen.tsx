// Long-term memory by scope. Entries can be corrected (ollupi then keeps
// extraction from rewriting them) or forgotten.

import { relativeTime } from '@ollupi/core'
import type { MemoryRow, MemoryStatus } from '@ollupi/protocol'
import { Badge, Button, EmptyState, IconButton, Select, Spinner, Textarea } from '@ollupi/ui'
import { Brain, Pencil, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editMemory, forgetMemory, readMemory, type MemoryScopes } from '../../domains/memory'
import { useWorkspaces } from '../../domains/workspaces'
import { useConnection } from '../../gateway/connection'
import { MemorySettings } from './MemorySettings'

/** The scope shown: global, or a workspace id. */
const GLOBAL = ''

export function MemoryScreen() {
  const workspaces = useWorkspaces((s) => s.list)
  const [scope, setScope] = useState(GLOBAL)
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

  // memory/list returns every status; only active memories are used.
  const activeIn = (key: string) => data?.scopes.get(key)?.filter((e) => e.status === 'active') ?? []
  const active = activeIn(scope)
  const count = (key: string) => (data ? ` (${activeIn(key).length})` : '')
  const elsewhere = [...(data?.scopes.keys() ?? [])].some((k) => k !== scope && activeIn(k).length > 0)

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold">Memory</h1>
        <Select
          aria-label="Scope"
          className="h-7 w-56 text-xs"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value={GLOBAL}>Global{count(GLOBAL)}</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {count(w.id)}
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
          <MemorySettings status={data?.status} />
          {data && <StatusLine status={data.status} />}
          {loading && !data ? (
            <div className="flex justify-center py-12 text-fg-subtle">
              <Spinner />
            </div>
          ) : active.length === 0 ? (
            elsewhere ? (
              <EmptyState icon={<Brain size={28} />} title="Nothing remembered in this scope">
                Memories are kept globally or per workspace; other scopes have some. Choose one above.
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
        <Badge tone={entry.workspaceId ? 'accent' : 'neutral'}>{entry.workspaceId ? (workspaceName ?? 'workspace') : 'global'}</Badge>
        {entry.userEdited && <Badge tone="success">edited by you</Badge>}
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
