// The user's MCP servers beside how each is doing, listed under each agent
// whose role keeps their tools (MCPServer.roles); an agent that keeps none
// is told so. A server is one, however many agents have it. ollupi keeps
// them and applies a change without a restart; what a server runs with is
// kept as it is written.

import type { MCPServer } from '@ollupi/protocol'
import { Badge, Button, Dialog, Field, IconButton, Input, Select, Textarea } from '@ollupi/ui'
import { Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { agentsOf, skillAgents } from '../../../../shared/ipc'
import { nameError, refreshMcp, removeServer, saveServer, useMcpServers, type McpFields } from '../../domains/mcp'
import { useTools } from '../../domains/tools'
import { useT, type Messages } from '../../i18n'
import { AgentSection, None } from './AgentSection'

export function McpSection() {
  const m = useT()
  const servers = useMcpServers((s) => s.list)
  const [editing, setEditing] = useState<{ name?: string }>()
  const tools = useTools((s) => s.list)
  if (!servers) return null

  return (
    <>
      <div className="flex gap-2">
        <Button icon={<Plus size={14} />} onClick={() => setEditing({})}>
          {m.settings.mcp.addServer}
        </Button>
        {servers.length > 0 && (
          <Button variant="ghost" icon={<RotateCw size={14} />} onClick={() => void refreshMcp()}>
            {m.settings.mcp.refreshStatus}
          </Button>
        )}
      </div>
      {servers.length === 0 ? (
        <p className="text-ui text-fg-subtle">{m.settings.mcp.empty}</p>
      ) : (
        skillAgents.map((agent) => {
          const own = servers.filter((s) => agentsOf(s.roles).includes(agent))
          return (
            <AgentSection key={agent} agent={agent} count={own.length}>
              {own.length === 0 ? (
                <None>{m.capabilities.noMcp}</None>
              ) : (
                <div className="flex flex-col gap-2">
                  {own.map((s) => (
                    <ServerCard
                      key={s.name}
                      server={s}
                      tools={tools.filter((t) => t.provider === s.name).map((t) => t.name)}
                      onEdit={() => setEditing({ name: s.name })}
                      onRemove={() => {
                        if (confirm(m.settings.mcp.confirmRemove(s.name))) void removeServer(s.name)
                      }}
                    />
                  ))}
                </div>
              )}
            </AgentSection>
          )
        })
      )}
      {editing && (
        <ServerDialog
          server={servers.find((s) => s.name === editing.name)}
          taken={servers.filter((s) => s.name !== editing.name).map((s) => s.name)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields) => {
            if (await saveServer(fields, editing.name)) setEditing(undefined)
          }}
        />
      )}
    </>
  )
}

function ServerCard({ server: s, tools, onEdit, onRemove }: { server: MCPServer; tools: string[]; onEdit(): void; onRemove(): void }) {
  const c = useT().settings.mcp.card
  // Left out for a server not started yet: it starts when its tools are needed.
  const status = s.status
  const keys = Object.keys((s.url ? s.headers : s.env) ?? {})
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-surface px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-ui font-medium text-fg">{s.name}</span>
            <Badge>{s.url ? 'HTTP' : 'stdio'}</Badge>
            {!status ? (
              <Badge tone="warning">{c.notStarted}</Badge>
            ) : status.connected ? (
              <Badge tone="success">{c.connected(status.tools)}</Badge>
            ) : (
              <Badge tone="danger">{c.notConnected}</Badge>
            )}
          </div>
          <div className="selectable mt-1 font-mono text-small break-all text-fg-subtle">
            {s.url ? s.url : [s.command, ...(s.args ?? [])].join(' ')}
          </div>
          {keys.length > 0 && (
            <div className="mt-1 text-small text-fg-muted">
              {s.url ? c.headers : c.env}: <span className="font-mono">{keys.join(', ')}</span>
            </div>
          )}
        </div>
        <IconButton label={c.edit(s.name)} size="sm" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label={c.remove(s.name)} size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      {status?.error && (
        <pre className="selectable max-h-40 overflow-auto rounded-2xl bg-canvas px-3.5 py-2.5 font-mono text-small whitespace-pre-wrap text-danger">
          {status.error}
        </pre>
      )}
      {!!status?.skippedTools?.length && (
        <p className="text-small text-fg-muted">
          {c.skipped(<span className="font-mono">{status.skippedTools.join(', ')}</span>)}
        </p>
      )}
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <code key={t} className="rounded-sm bg-hover px-1.5 py-0.5 font-mono text-small text-fg-muted">
              {t}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

function toLines(values: Record<string, string | undefined> | undefined, sep: string): string {
  return Object.entries(values ?? {})
    .map(([k, v]) => `${k}${sep}${v ?? ''}`)
    .join('\n')
}

/** Parses KEY=value (or Name: value) lines. */
function fromLines(text: string, sep: string, m: Messages): { values: Record<string, string>; error?: string } {
  const values: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const at = line.indexOf(sep)
    const key = at > 0 ? line.slice(0, at).trim() : ''
    if (!key) return { values, error: m.settings.mcp.lineFormat(sep) }
    if (key in values) return { values, error: m.settings.mcp.listedTwice(key) }
    values[key] = line.slice(at + sep.length).trim()
  }
  return { values }
}

function ServerDialog({
  server,
  taken,
  onClose,
  onSave,
}: {
  server: MCPServer | undefined
  taken: string[]
  onClose(): void
  onSave(fields: McpFields): Promise<void>
}) {
  const m = useT()
  const t = m.settings.mcp.dialog
  const [name, setName] = useState(server?.name ?? '')
  const [transport, setTransport] = useState<'stdio' | 'http'>(server?.url ? 'http' : 'stdio')
  const [command, setCommand] = useState(server?.command ?? '')
  const [args, setArgs] = useState((server?.args ?? []).join('\n'))
  const [envText, setEnvText] = useState(toLines(server?.env, '='))
  const [url, setUrl] = useState(server?.url ?? '')
  const [headersText, setHeadersText] = useState(toLines(server?.headers, ': '))
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameReason = trimmed ? nameError(trimmed, taken) : undefined
  const nameProblem = nameReason && m.errors.mcpName[nameReason]
  const parsedEnv = fromLines(envText, '=', m)
  const parsedHeaders = fromLines(headersText, ':', m)
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
      wide
      footer={
        <>
          <Button size="lg" onClick={onClose}>{m.common.cancel}</Button>
          <Button size="lg" variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {m.settings.mcp.dialog.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.name} error={nameProblem} hint={renamed ? m.settings.mcp.renamed : t.nameHint(trimmed || t.namePlaceholder)}>
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
              <Input value={command} spellCheck={false} className="font-mono text-small" placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
            </Field>
            <Field label={t.args} hint={t.argsHint}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-small"
                value={args}
                placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
                onChange={(e) => setArgs(e.target.value)}
              />
            </Field>
            <Field label={t.env} error={parsedEnv.error} hint={t.envHint(t.secrets)}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-small"
                value={envText}
                placeholder="API_TOKEN=…"
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
                className="font-mono text-small"
                placeholder="https://example.com/mcp"
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label={t.headers} error={parsedHeaders.error} hint={t.headersHint(t.secrets)}>
              <Textarea
                rows={3}
                spellCheck={false}
                className="font-mono text-small"
                value={headersText}
                placeholder="Authorization: Bearer …"
                onChange={(e) => setHeadersText(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
