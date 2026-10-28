// MCP servers: their entries in config.yaml, edited by the backend's rules,
// and how each is doing in the running backend (mcpServer/list). ollupi
// connects them at start and skips one it cannot use, reporting why; a
// server can also disconnect later, so the status is read on demand.

import type { ServerStatus } from '@ollupi/protocol'
import { BROWSER_PROVIDER, type BackendConfig, type ConfigChange } from '../../../shared/ipc'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'

export type McpServer = NonNullable<BackendConfig['mcp']>[number]

export function readMcpStatus(): Promise<ServerStatus[] | undefined> {
  return run((e) => e.config.mcpStatus, async () => (await gateway().call('mcpServer/list', {})).data)
}

/** ollupi's rule for a server name (mcp.Connect): it prefixes the server's
 * tool names as <name>__<tool>. Says what is wrong: the format, another
 * server has the name, or the app's browser provider does (the sidecar
 * refuses it). */
export function nameError(name: string, taken: string[]): 'format' | 'taken' | 'builtin' | undefined {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(name) || name.includes('__')) return 'format'
  if (name === BROWSER_PROVIDER) return 'builtin'
  if (taken.includes(name)) return 'taken'
  return undefined
}

/** A value --check-config left out: written in the file and naming no
 * ${NAME} variable, so possibly a secret. Editing keeps it unless changed. */
export const KEPT = null

export type Values = Record<string, string | typeof KEPT>

export type McpFields =
  | { name: string; transport: 'stdio'; command: string; args: string[]; env: Values }
  | { name: string; transport: 'http'; url: string; headers: Values }

/** The values as the form shows them: a left-out value is kept. */
export function valuesOf(m: Record<string, string | undefined> | undefined): Values {
  return Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, v ? v : KEPT]))
}

const list = (c: BackendConfig): McpServer[] => c.mcp ?? []

function entry(f: McpFields): McpServer {
  const values = (v: Values) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== KEPT)) as Record<string, string>
  if (f.transport === 'stdio') {
    return {
      name: f.name,
      command: f.command,
      ...(f.args.length && { args: f.args }),
      ...(Object.keys(f.env).length && { env: values(f.env) }),
    }
  }
  return { name: f.name, url: f.url, ...(Object.keys(f.headers).length && { headers: values(f.headers) }) }
}

export function addServer(config: BackendConfig, f: McpFields): ConfigChange[] {
  return [{ kind: 'set', path: ['mcp', list(config).length], value: entry(f) }]
}

/** Sets what changed, key by key, so a value left out of what the app was
 * given stays in the file. A server has one transport: choosing the other
 * removes the first one's keys. */
export function editServer(config: BackendConfig, index: number, f: McpFields): ConfigChange[] {
  const old = list(config)[index]!
  const path = ['mcp', index]
  const changes: ConfigChange[] = [{ kind: 'set', path: [...path, 'name'], value: f.name }]
  const map = (key: 'env' | 'headers', next: Values, before: Record<string, string | undefined> | undefined) => {
    const prev = before ?? {}
    if (Object.keys(next).length === 0) {
      if (before) changes.push({ kind: 'delete', path: [...path, key] })
      return
    }
    for (const k of Object.keys(prev)) if (!(k in next)) changes.push({ kind: 'delete', path: [...path, key, k] })
    for (const [k, v] of Object.entries(next)) if (v !== KEPT && v !== prev[k]) changes.push({ kind: 'set', path: [...path, key, k], value: v })
  }
  if (f.transport === 'stdio') {
    changes.push({ kind: 'set', path: [...path, 'command'], value: f.command })
    if (!f.args.length) changes.push({ kind: 'delete', path: [...path, 'args'] })
    else if (f.args.join('\0') !== (old.args ?? []).join('\0')) changes.push({ kind: 'set', path: [...path, 'args'], value: f.args })
    map('env', f.env, old.env)
    changes.push({ kind: 'delete', path: [...path, 'url'] }, { kind: 'delete', path: [...path, 'headers'] })
  } else {
    changes.push({ kind: 'set', path: [...path, 'url'], value: f.url })
    map('headers', f.headers, old.headers)
    changes.push({ kind: 'delete', path: [...path, 'command'] }, { kind: 'delete', path: [...path, 'args'] }, { kind: 'delete', path: [...path, 'env'] })
  }
  return changes
}

export function removeServer(index: number): ConfigChange[] {
  return [{ kind: 'delete', path: ['mcp', index] }]
}
