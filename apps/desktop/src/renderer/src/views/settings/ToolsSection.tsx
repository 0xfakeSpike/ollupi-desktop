// The tools the agent offers its model, by provider, with the hints ollupi
// uses for permissions (tools.Annotations).

import type { Annotations, ToolDescriptor } from '@ollupi/protocol'
import { Badge } from '@ollupi/ui'
import { useMemo } from 'react'
import { useTools } from '../../domains/tools'

export function ToolsSection() {
  const tools = useTools((s) => s.list)
  const byProvider = useMemo(() => {
    const groups = new Map<string, ToolDescriptor[]>()
    for (const t of tools) groups.set(t.provider, [...(groups.get(t.provider) ?? []), t])
    return [...groups]
  }, [tools])

  return (
    <div className="flex flex-col gap-3">
      {byProvider.map(([provider, list]) => (
        <div key={provider} className="rounded-xl border border-line">
          <div className="border-b border-line px-4 py-2 text-xs font-medium text-fg-muted">{provider}</div>
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.name} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="font-mono text-[12px] text-fg">{t.name}</code>
                  <Hints annotations={t.annotations} />
                </div>
                {t.description && <p className="selectable mt-1 line-clamp-2 text-xs text-fg-muted">{t.description}</p>}
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
  return (
    <>
      {a.readOnlyHint && <Badge tone="success">read-only</Badge>}
      {a.destructiveHint && <Badge tone="danger">destructive</Badge>}
      {(a.openWorldHint ?? true) && <Badge>external</Badge>}
    </>
  )
}
