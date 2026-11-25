// The tools the agents have built in, from ollupi and this app's browser,
// listed under each agent whose role keeps them (ToolDescriptor.roles) and
// grouped by what they let it do, a card each: each group says so in a line, and opens
// into its tools with the names permission rules use and the hints ollupi
// uses for permissions (tools.Annotations), worded for a person. MCP
// servers' tools are listed under their servers.

import type { Annotations, ToolDescriptor } from '@ollupi/protocol'
import { Badge, ClampText, cn, Details } from '@ollupi/ui'
import { useMemo, useState } from 'react'
import { agentsOf, skillAgents, type SkillAgent } from '../../../../shared/ipc'
import { useMcpServers } from '../../domains/mcp'
import { useTools } from '../../domains/tools'
import { useT, type Messages } from '../../i18n'
import { AgentSection } from './AgentSection'

/** The providers ollupi and this app register, in the order a person meets
 * what they do; one not listed here keeps its own name, after these. */
const order = ['workspace', 'web', 'browser', 'plan', 'user_input', 'subagents', 'hub', 'memory', 'skills', 'cron', 'context', 'tool_registry', 'deferred_tools']
type Known = keyof Messages['capabilities']['groups']
type Groups = [provider: string, tools: ToolDescriptor[]][]

export function ToolsSection() {
  const tools = useTools((s) => s.list)
  // An MCP server is its tools' provider. Select the stored list itself: a
  // selector that builds a new array each call never settles.
  const serverList = useMcpServers((s) => s.list)
  const servers = useMemo(() => serverList?.map((x) => x.name), [serverList])
  const byAgent = useMemo(() => {
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length)
    return skillAgents.map((agent): [SkillAgent, Groups] => {
      const groups = new Map<string, ToolDescriptor[]>()
      for (const t of tools) if (!servers?.includes(t.provider) && agentsOf(t.roles).includes(agent)) groups.set(t.provider, [...(groups.get(t.provider) ?? []), t])
      return [agent, [...groups].sort(([a], [b]) => rank(a) - rank(b))]
    })
  }, [tools, servers])

  if (!servers) return null
  return byAgent.map(([agent, groups]) => (
    <AgentSection key={agent} agent={agent} count={groups.reduce((n, [, list]) => n + list.length, 0)}>
      <ToolGroups groups={groups} />
    </AgentSection>
  ))
}

function ToolGroups({ groups }: { groups: Groups }) {
  const m = useT()
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const toggle = (provider: string, open: boolean) =>
    setOpened((was) => new Set(open ? [...was, provider] : [...was].filter((p) => p !== provider)))
  return (
    // Filled row by row, two to a row where the column is wide enough, the
    // cards of a row as tall as each other. A group opened takes a row of its
    // own, so its list never leaves the card beside it alone in a tall row;
    // the next ones close up behind it.
    <ul className="grid grid-flow-row-dense gap-2.5 @3xl/page:grid-cols-2">
      {groups.map(([provider, list]) => {
        const group = (m.capabilities.groups as Record<string, { name: string; about: string } | undefined>)[provider as Known]
        return (
          <li key={provider} className={cn('flex min-w-0 flex-col gap-1 rounded-3xl bg-surface px-5 py-3.5', opened.has(provider) && '@3xl/page:col-span-2')}>
            <span className="text-ui font-medium text-fg">{group?.name ?? provider}</span>
            {group && <p className="text-small text-fg-muted">{group.about}</p>}
            <Details
              open={opened.has(provider)}
              onToggle={(open) => toggle(provider, open)}
              summary={<span className="text-small text-fg-subtle">{m.capabilities.toolCount(list.length)}</span>}
            >
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
