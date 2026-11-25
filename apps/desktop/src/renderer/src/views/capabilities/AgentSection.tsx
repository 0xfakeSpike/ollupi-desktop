// One agent's part of a capabilities tab: its name over what it has, the
// count at the right, as the todos panel heads its groups (DESIGN.md).

import type { ReactNode } from 'react'
import type { SkillAgent } from '../../../../shared/ipc'
import { useT } from '../../i18n'

export function AgentSection({ agent, count, children }: { agent: SkillAgent; count?: number; children: ReactNode }) {
  const m = useT()
  return (
    <section className="flex flex-col gap-1.5" aria-label={m.skills.agents[agent].name}>
      <h3 className="flex items-baseline justify-between px-1 text-small font-medium text-fg-subtle">
        <span>{m.skills.agents[agent].name}</span>
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** In place of what an agent has, when it has none. */
export function None({ children }: { children: ReactNode }) {
  return <p className="px-1 text-ui text-fg-subtle">{children}</p>
}
