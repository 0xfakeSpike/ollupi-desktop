// The tools the agent has built in, from ollupi and this app's browser, by
// provider, with the hints ollupi uses for permissions (tools.Annotations).
// MCP servers' tools are listed under their servers.

import type { Annotations, ToolDescriptor } from '@ollupi/protocol'
import { Badge } from '@ollupi/ui'
import { useEffect, useMemo, useState } from 'react'
import { readMcpStatus } from '../../domains/mcpConfig'
import { useTools } from '../../domains/tools'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'

export function ToolsSection() {
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
    return [...groups]
  }, [tools, servers])

  if (!servers) return null
  return (
    <div className="flex flex-col gap-3">
      {byProvider.map(([provider, list]) => (
        <div key={provider} className="rounded-lg border border-line">
          <div className="border-b border-line px-4 py-2 text-small font-medium text-fg-muted">{provider}</div>
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.name} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="font-mono text-small text-fg">{t.name}</code>
                  <Hints annotations={t.annotations} />
                </div>
                {t.description && <p className="selectable mt-1 line-clamp-2 text-small text-fg-muted">{t.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** tools.OpenWorld: a tool reaches outside unless it says it does not. */
function Hints({ annotations: a }: { annotations: Annotations }) {
  const m = useT()
  return (
    <>
      {a.readOnlyHint && <Badge tone="success">{m.settings.tools.readOnly}</Badge>}
      {a.destructiveHint && <Badge tone="danger">{m.settings.tools.destructive}</Badge>}
      {(a.openWorldHint ?? true) && <Badge>{m.settings.tools.external}</Badge>}
    </>
  )
}
