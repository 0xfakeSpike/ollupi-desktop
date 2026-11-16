// The tools the agent has built in, from ollupi and this app's browser,
// grouped by what they let it do: each group says so in a line, and opens
// into its tools with the names permission rules use and the hints ollupi
// uses for permissions (tools.Annotations), worded for a person. MCP
// servers' tools are listed under their servers.

import type { Annotations, ToolDescriptor } from '@ollupi/protocol'
import { Badge, ClampText, Details } from '@ollupi/ui'
import { useEffect, useMemo, useState } from 'react'
import { readMcpStatus } from '../../domains/mcpConfig'
import { useTools } from '../../domains/tools'
import { useConnection } from '../../gateway/connection'
import { useT, type Messages } from '../../i18n'

/** The providers ollupi and this app register, in the order a person meets
 * what they do; one not listed here keeps its own name, after these. */
const order = ['workspace', 'web', 'browser', 'plan', 'user_input', 'subagent', 'memory', 'skills', 'cron', 'context', 'tool_registry']
type Known = keyof Messages['capabilities']['groups']

export function ToolsSection() {
  const m = useT()
  const tools = useTools((s) => s.list)
  // An MCP server is its tools' provider: the running backend names them.
  const [servers, setServers] = useState<string[]>()
  const connected = useConnection((s) => s.gateway === 'connected')
  useEffect(() => {
    if (connected) void readMcpStatus().then((list) => setServers(list?.map((s) => s.name) ?? []))
  }, [connected])
  const byProvider = useMemo(() => {
    const groups = new Map<string, ToolDescriptor[]>()
    for (const t of tools) if (!servers?.includes(t.provider)) groups.set(t.provider, [...(groups.get(t.provider) ?? []), t])
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length)
    return [...groups].sort(([a], [b]) => rank(a) - rank(b))
  }, [tools, servers])

  if (!servers) return null
  return (
    <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
      {byProvider.map(([provider, list]) => {
        const group = (m.capabilities.groups as Record<string, { name: string; about: string } | undefined>)[provider as Known]
        return (
          <li key={provider} className="flex flex-col gap-1 px-5 py-3.5">
            <span className="text-ui font-medium text-fg">{group?.name ?? provider}</span>
            {group && <p className="text-small text-fg-muted">{group.about}</p>}
            <Details summary={<span className="text-small text-fg-subtle">{m.capabilities.toolCount(list.length)}</span>}>
              <ul className="mt-2 flex flex-col gap-3">
                {list.map((t) => (
                  <li key={t.name} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="font-mono text-small text-fg">{t.name}</code>
                      <Hints annotations={t.annotations} />
                    </div>
                    {t.description && (
                      <ClampText text={t.description} lines={2} more={m.common.showAll} less={m.common.showLess} className="max-w-prose text-small text-fg-muted" />
                    )}
                  </li>
                ))}
              </ul>
            </Details>
          </li>
        )
      })}
    </ul>
  )
}

/** What a tool does to the world, in words; neutral, as they describe the
 * tool rather than a state. tools.OpenWorld: a tool reaches outside unless
 * it says it does not. */
function Hints({ annotations: a }: { annotations: Annotations }) {
  const m = useT()
  return (
    <>
      {a.readOnlyHint && <Badge>{m.settings.tools.readOnly}</Badge>}
      {a.destructiveHint && <Badge>{m.settings.tools.destructive}</Badge>}
      {(a.openWorldHint ?? true) && <Badge>{m.settings.tools.external}</Badge>}
    </>
  )
}
