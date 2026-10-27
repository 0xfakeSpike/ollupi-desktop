// config.yaml's MCP servers beside how each is doing in the running
// backend. ollupi connects them at start, so saving a change checks it with
// the backend, writes it and restarts. Secrets stay in the user's
// environment: env and header values name them as ${NAME}.

import type { ServerStatus } from '@ollupi/protocol'
import { Badge, Button, Callout, Dialog, Field, IconButton, Input, Select, Textarea } from '@ollupi/ui'
import { Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import {
  addServer,
  editServer,
  KEPT,
  nameError,
  readMcpStatus,
  removeServer,
  valuesOf,
  type McpFields,
  type McpServer,
  type Values,
} from '../../domains/mcpConfig'
import { useTools } from '../../domains/tools'
import { useConnection } from '../../gateway/connection'
import { useT, type Messages } from '../../i18n'
import { desktop } from '../../platform/desktop'

export function McpSection() {
  const m = useT()
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  const [statuses, setStatuses] = useState<ServerStatus[]>()
  const [editing, setEditing] = useState<{ index?: number }>()
  const connected = useConnection((s) => s.gateway === 'connected')
  const tools = useTools((s) => s.list)

  const reloadStatus = useCallback(async () => setStatuses(await readMcpStatus()), [])
  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? setChecked(r) : setError(r?.error)))
  }, [])
  // A restart replaces the backend and its servers: read again once the new
  // one is connected.
  useEffect(() => {
    if (connected) void reloadStatus()
  }, [connected, reloadStatus])

  if (error) return <Callout tone="danger">{m.settings.config.unreadable(error)}</Callout>
  if (!checked) return null

  const servers = checked.config.mcp ?? []
  const apply = async (changes: Parameters<typeof applyConfig>[0]) => {
    const applied = await applyConfig(changes)
    if (applied) setChecked(applied)
    return !!applied
  }
  // The file and the running backend disagree, e.g. after a hand edit.
  const stale = connected && statuses && statuses.map((s) => s.name).join('\n') !== servers.map((s) => s.name).join('\n')

  return (
    <>
      {stale && (
        <Callout tone="warning">
          <div className="flex items-center gap-3">
            <span className="flex-1">{m.settings.mcp.stale}</span>
            <Button size="sm" icon={<RotateCw size={13} />} onClick={() => void desktop.backend.restart()}>
              {m.common.restartBackend}
            </Button>
          </div>
        </Callout>
      )}
      {servers.length === 0 && <p className="text-[13px] text-fg-subtle">{m.settings.mcp.empty}</p>}
      {servers.map((s, i) => (
        <ServerCard
          key={`${i}:${s.name}`}
          server={s}
          status={statuses?.find((x) => x.name === s.name)}
          tools={tools.filter((t) => t.provider === s.name).map((t) => t.name)}
          onEdit={() => setEditing({ index: i })}
          onRemove={() => {
            if (confirm(m.settings.mcp.confirmRemove(s.name))) void apply(removeServer(i))
          }}
        />
      ))}
      <div className="flex gap-2">
        <Button icon={<Plus size={14} />} onClick={() => setEditing({})}>
          {m.settings.mcp.addServer}
        </Button>
        {servers.length > 0 && (
          <Button variant="ghost" icon={<RotateCw size={14} />} onClick={() => void reloadStatus()}>
            {m.settings.mcp.refreshStatus}
          </Button>
        )}
      </div>
      {editing && (
        <ServerDialog
          server={editing.index === undefined ? undefined : servers[editing.index]}
          taken={servers.filter((_, i) => i !== editing.index).map((s) => s.name)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields) => {
            const changes = editing.index === undefined ? addServer(checked.config, fields) : editServer(checked.config, editing.index, fields)
            if (await apply(changes)) setEditing(undefined)
          }}
        />
      )}
    </>
  )
}

function ServerCard({
  server: s,
  status,
  tools,
  onEdit,
  onRemove,
}: {
  server: McpServer
  /** Undefined when the running backend did not start with this server. */
  status: ServerStatus | undefined
  tools: string[]
  onEdit(): void
  onRemove(): void
}) {
  const c = useT().settings.mcp.card
  const keys = Object.keys((s.url ? s.headers : s.env) ?? {})
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg">{s.name}</span>
            <Badge>{s.url ? 'HTTP' : 'stdio'}</Badge>
            {!status ? (
              <Badge tone="warning">{c.notStarted}</Badge>
            ) : status.connected ? (
              <Badge tone="success">{c.connected(status.tools)}</Badge>
            ) : (
              <Badge tone="danger">{c.notConnected}</Badge>
            )}
          </div>
          <div className="selectable mt-1 font-mono text-xs break-all text-fg-subtle">
            {s.url ? s.url : [s.command, ...(s.args ?? [])].join(' ')}
          </div>
          {keys.length > 0 && (
            <div className="mt-1 text-xs text-fg-muted">
              {s.url ? c.headers : c.env}: <span className="font-mono">{keys.join(', ')}</span>
            </div>
          )}
        </div>
        <IconButton label={c.edit(s.name)} size="sm" onClick={onEdit}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label={c.remove(s.name)} size="sm" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      {status?.error && (
        <pre className="selectable max-h-40 overflow-auto rounded-lg bg-danger-soft px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-danger">
          {status.error}
        </pre>
      )}
      {!!status?.skippedTools?.length && (
        <p className="text-xs text-fg-muted">
          {c.skipped(<span className="font-mono">{status.skippedTools.join(', ')}</span>)}
        </p>
      )}
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <code key={t} className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {t}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

/** `written` is shown in place of a value the app was not given; kept
 * unless changed. */
function toLines(values: Values, sep: string, written: string): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}${sep}${v === KEPT ? written : v}`)
    .join('\n')
}

/** Parses KEY=value (or Name: value) lines; a line still showing `written`,
 * as toLines put it, keeps the value in the file. */
function fromLines(text: string, sep: string, before: Values, written: string, m: Messages): { values: Values; error?: string } {
  const values: Values = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const at = line.indexOf(sep)
    const key = at > 0 ? line.slice(0, at).trim() : ''
    if (!key) return { values, error: m.settings.mcp.lineFormat(sep) }
    if (key in values) return { values, error: m.settings.mcp.listedTwice(key) }
    const value = line.slice(at + sep.length).trim()
    values[key] = value === written && before[key] === KEPT ? KEPT : value
  }
  return { values }
}

function ServerDialog({
  server,
  taken,
  onClose,
  onSave,
}: {
  server: McpServer | undefined
  taken: string[]
  onClose(): void
  onSave(fields: McpFields): Promise<void>
}) {
  const m = useT()
  const t = m.settings.mcp.dialog
  // The placeholder as the dialog first showed it, so a language change
  // while it is open still reads it back as a kept value.
  const [written] = useState(m.settings.mcp.written)
  const env = valuesOf(server?.env)
  const headers = valuesOf(server?.headers)
  const [name, setName] = useState(server?.name ?? '')
  const [transport, setTransport] = useState<'stdio' | 'http'>(server?.url ? 'http' : 'stdio')
  const [command, setCommand] = useState(server?.command ?? '')
  const [args, setArgs] = useState((server?.args ?? []).join('\n'))
  const [envText, setEnvText] = useState(toLines(env, '=', written))
  const [url, setUrl] = useState(server?.url ?? '')
  const [headersText, setHeadersText] = useState(toLines(headers, ': ', written))
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameReason = trimmed ? nameError(trimmed, taken) : undefined
  const nameProblem = nameReason && m.errors.mcpName[nameReason]
  const parsedEnv = fromLines(envText, '=', env, written, m)
  const parsedHeaders = fromLines(headersText, ':', headers, written, m)
  const valid =
    !!trimmed &&
    !nameProblem &&
    (transport === 'stdio' ? !!command.trim() && !parsedEnv.error : /^https?:\/\/\S+$/.test(url.trim()) && !parsedHeaders.error)
  const renamed = server && trimmed !== server.name

  const save = async () => {
    setSaving(true)
    await onSave(
      transport === 'stdio'
        ? {
            name: trimmed,
            transport,
            command: command.trim(),
            args: args
              .split('\n')
              .map((a) => a.trim())
              .filter(Boolean),
            env: parsedEnv.values,
          }
        : { name: trimmed, transport, url: url.trim(), headers: parsedHeaders.values },
    )
    setSaving(false)
  }

  return (
    <Dialog
      title={server ? t.editTitle(server.name) : t.addTitle}
      closeLabel={m.common.close}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>{m.common.cancel}</Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {m.settings.config.saveAndRestart}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.name} hint={nameProblem ?? (renamed ? m.settings.mcp.renamed : t.nameHint(trimmed || t.namePlaceholder))}>
          <Input value={name} autoFocus spellCheck={false} placeholder="github" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.transport}>
          <Select className="max-w-60" value={transport} onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}>
            <option value="stdio">{t.stdio}</option>
            <option value="http">{t.http}</option>
          </Select>
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label={t.command} hint={t.commandHint}>
              <Input value={command} spellCheck={false} className="font-mono text-xs" placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
            </Field>
            <Field label={t.args} hint={t.argsHint}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                value={args}
                placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
                onChange={(e) => setArgs(e.target.value)}
              />
            </Field>
            <Field label={t.env} hint={parsedEnv.error ?? t.envHint(t.secrets)}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                value={envText}
                placeholder="API_TOKEN=${MY_API_TOKEN}"
                onChange={(e) => setEnvText(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t.url}>
              <Input
                value={url}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="https://example.com/mcp"
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label={t.headers} hint={parsedHeaders.error ?? t.headersHint(t.secrets)}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                value={headersText}
                placeholder="Authorization: Bearer ${GITHUB_TOKEN}"
                onChange={(e) => setHeadersText(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
