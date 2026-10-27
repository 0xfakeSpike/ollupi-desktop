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
import { desktop } from '../../platform/desktop'

const RENAMED = 'Its tools are named <name>__<tool>, so permission rules that name the old tools must change too.'

export function McpSection() {
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

  if (error) return <Callout tone="danger">config.yaml cannot be read: {error}</Callout>
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
            <span className="flex-1">config.yaml lists different MCP servers than the backend started with.</span>
            <Button size="sm" icon={<RotateCw size={13} />} onClick={() => void desktop.backend.restart()}>
              Restart backend
            </Button>
          </div>
        </Callout>
      )}
      {servers.length === 0 && <p className="text-[13px] text-fg-subtle">No MCP servers yet.</p>}
      {servers.map((s, i) => (
        <ServerCard
          key={`${i}:${s.name}`}
          server={s}
          status={statuses?.find((x) => x.name === s.name)}
          tools={tools.filter((t) => t.provider === s.name).map((t) => t.name)}
          onEdit={() => setEditing({ index: i })}
          onRemove={() => {
            if (confirm(`Remove the MCP server ${s.name}? Its tools go with it.`)) void apply(removeServer(i))
          }}
        />
      ))}
      <div className="flex gap-2">
        <Button icon={<Plus size={14} />} onClick={() => setEditing({})}>
          Add server
        </Button>
        {servers.length > 0 && (
          <Button variant="ghost" icon={<RotateCw size={14} />} onClick={() => void reloadStatus()}>
            Refresh status
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
  const keys = Object.keys((s.url ? s.headers : s.env) ?? {})
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg">{s.name}</span>
            <Badge>{s.url ? 'HTTP' : 'stdio'}</Badge>
            {!status ? (
              <Badge tone="warning">not started</Badge>
            ) : status.connected ? (
              <Badge tone="success">
                connected · {status.tools} {status.tools === 1 ? 'tool' : 'tools'}
              </Badge>
            ) : (
              <Badge tone="danger">not connected</Badge>
            )}
          </div>
          <div className="selectable mt-1 font-mono text-xs break-all text-fg-subtle">
            {s.url ? s.url : [s.command, ...(s.args ?? [])].join(' ')}
          </div>
          {keys.length > 0 && (
            <div className="mt-1 text-xs text-fg-muted">
              {s.url ? 'Headers' : 'Env'}: <span className="font-mono">{keys.join(', ')}</span>
            </div>
          )}
        </div>
        <IconButton label={`Edit ${s.name}`} size="sm" onClick={onEdit}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label={`Remove ${s.name}`} size="sm" onClick={onRemove}>
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
          Not offered, since the model API refuses their names once prefixed:{' '}
          <span className="font-mono">{status.skippedTools.join(', ')}</span>
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

/** Shown in place of a value the app was not given; kept unless changed. */
const WRITTEN = '(written in config.yaml)'

function toLines(values: Values, sep: string): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}${sep}${v === KEPT ? WRITTEN : v}`)
    .join('\n')
}

/** Parses KEY=value (or Name: value) lines; a line still showing WRITTEN
 * keeps the value in the file. */
function fromLines(text: string, sep: string, before: Values): { values: Values; error?: string } {
  const values: Values = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const at = line.indexOf(sep)
    const key = at > 0 ? line.slice(0, at).trim() : ''
    if (!key) return { values, error: `Write each line as name${sep}value.` }
    if (key in values) return { values, error: `${key} is listed twice.` }
    const value = line.slice(at + sep.length).trim()
    values[key] = value === WRITTEN && before[key] === KEPT ? KEPT : value
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
  const env = valuesOf(server?.env)
  const headers = valuesOf(server?.headers)
  const [name, setName] = useState(server?.name ?? '')
  const [transport, setTransport] = useState<'stdio' | 'http'>(server?.url ? 'http' : 'stdio')
  const [command, setCommand] = useState(server?.command ?? '')
  const [args, setArgs] = useState((server?.args ?? []).join('\n'))
  const [envText, setEnvText] = useState(toLines(env, '='))
  const [url, setUrl] = useState(server?.url ?? '')
  const [headersText, setHeadersText] = useState(toLines(headers, ': '))
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameProblem = trimmed ? nameError(trimmed, taken) : undefined
  const parsedEnv = fromLines(envText, '=', env)
  const parsedHeaders = fromLines(headersText, ':', headers)
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

  const secrets = 'Write a secret as ${NAME}, a variable exported in ~/.zshrc; the backend checks it is set.'
  return (
    <Dialog
      title={server ? `Edit ${server.name}` : 'Add MCP server'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            Save and restart
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" hint={nameProblem ?? (renamed ? RENAMED : `Its tools are offered as ${trimmed || 'name'}__<tool>.`)}>
          <Input value={name} autoFocus spellCheck={false} placeholder="github" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Transport">
          <Select className="max-w-60" value={transport} onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}>
            <option value="stdio">Command (stdio)</option>
            <option value="http">URL (streamable HTTP)</option>
          </Select>
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label="Command" hint="Found on the PATH of your login shell.">
              <Input value={command} spellCheck={false} className="font-mono text-xs" placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
            </Field>
            <Field label="Arguments" hint="One per line.">
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                value={args}
                placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
                onChange={(e) => setArgs(e.target.value)}
              />
            </Field>
            <Field label="Environment" hint={parsedEnv.error ?? `KEY=value per line. The command also inherits the backend's environment. ${secrets}`}>
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
            <Field label="URL">
              <Input
                value={url}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="https://example.com/mcp"
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label="Headers" hint={parsedHeaders.error ?? `Name: value per line, sent with every request. ${secrets}`}>
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
