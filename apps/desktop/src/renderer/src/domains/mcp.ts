// The user's MCP servers, kept in ollupi with how each is doing
// (mcpServer/list). A change applies without a restart: ollupi closes the
// user's servers and starts them again when their tools are next needed,
// and tells every client of the change (mcpServer/changed). What a server
// runs with is kept as it is written and sent to it so; a command also
// inherits the backend's environment. How a server is doing is read on
// demand, since one can drop at any time; so are the tools, which change
// with the servers.

import type { OllupiClient } from '@ollupi/client'
import type { MCPServer, MCPServerChangedNotification, MCPServerConfig } from '@ollupi/protocol'
import { create } from 'zustand'
import { BROWSER_PROVIDER } from '../../../shared/ipc'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { useTools } from './tools'

/** Undefined until read on a connection. */
export const useMcpServers = create<{ list: MCPServer[] | undefined }>()(() => ({ list: undefined }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

/** The server as now written, not started yet; reading again says how it does. */
function changed({ name, server, seq }: MCPServerChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useMcpServers.setState((s) => {
    if (!s.list) return s
    const rest = s.list.filter((x) => x.name !== name)
    return { list: server ? [...rest, server].sort((a, b) => a.name.localeCompare(b.name)) : rest }
  })
}

async function read(client: OllupiClient): Promise<void> {
  const [{ result, newer }, tools] = await Promise.all([client.snapshot('mcpServer/list', {}, ['mcpServer/changed']), client.call('tool/list', {})])
  seen = result.seq
  useMcpServers.setState({ list: result.data })
  newer.forEach((e) => changed(e.params))
  useTools.setState({ list: tools.data })
}

export const mcpDomain: Domain = {
  bind: (client) =>
    client.on('mcpServer/changed', (params) => {
      changed(params)
      void read(client).catch(() => undefined)
    }),
  sync: (client) => read(client),
  disconnect: () => {
    seen = 0
    useMcpServers.setState({ list: undefined })
  },
}

/** Reads again how each server is doing. */
export function refreshMcp(): Promise<void | undefined> {
  return run((e) => e.config.mcpStatus, () => read(gateway()))
}

/** ollupi's rule for a server name (user.MCPServer): it prefixes the
 * server's tool names as <name>__<tool>. Says what is wrong: the format,
 * another server has the name, or the app's browser provider does, whose
 * tools would clash with its. */
export function nameError(name: string, taken: string[]): 'format' | 'taken' | 'builtin' | undefined {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(name) || name.includes('__')) return 'format'
  if (name === BROWSER_PROVIDER) return 'builtin'
  if (taken.includes(name)) return 'taken'
  return undefined
}

export type McpFields =
  | { name: string; transport: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | { name: string; transport: 'http'; url: string; headers: Record<string, string> }

/** A server as ollupi keeps it: one transport, and only what is set. */
export function serverOf(f: McpFields): MCPServerConfig {
  if (f.transport === 'stdio') {
    return { name: f.name, command: f.command, ...(f.args.length && { args: f.args }), ...(Object.keys(f.env).length && { env: f.env }) }
  }
  return { name: f.name, url: f.url, ...(Object.keys(f.headers).length && { headers: f.headers }) }
}

/** Adds a server, or replaces the one named was; a server renamed is the
 * old one removed once the new one is in. Resolves to whether it was. */
export function saveServer(f: McpFields, was?: string): Promise<boolean> {
  return run((e) => e.config.save, async () => {
    await gateway().call('mcpServer/set', serverOf(f))
    if (was && was !== f.name) await gateway().call('mcpServer/delete', { name: was })
    return true
  }).then(Boolean)
}

export function removeServer(name: string): Promise<void | undefined> {
  return run((e) => e.config.save, async () => {
    await gateway().call('mcpServer/delete', { name })
  })
}
