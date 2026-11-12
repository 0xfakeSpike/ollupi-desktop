// What the agent can do, in one place: its skills, the MCP servers that give
// it tools, and the tools it has built in.

import { Tabs } from '@ollupi/ui'
import { go, type CapabilityTab } from '../../domains/navigation'
import { useT } from '../../i18n'
import { McpSection } from './McpSection'
import { SkillsSection } from './SkillsSection'
import { ToolsSection } from './ToolsSection'

const tabIds: CapabilityTab[] = ['skills', 'mcp', 'tools']

export function CapabilitiesScreen({ tab }: { tab: CapabilityTab }) {
  const t = useT().capabilities
  const tabs = tabIds.map((id) => ({ id, label: t.tabs[id].label }))
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-16 shrink-0 items-center pl-6">
        <h1 className="text-title">{t.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Its labels start under the header's title. */}
        <nav className="w-56 shrink-0 overflow-y-auto px-3 py-2">
          <Tabs<CapabilityTab> label={t.title} orientation="vertical" tabs={tabs} value={tab} onChange={(id) => go({ kind: 'capabilities', tab: id })} />
        </nav>
        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="scroll-centered flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-6">
            <p className="text-ui text-fg-muted">{t.tabs[tab].description}</p>
            {tab === 'skills' && <SkillsSection />}
            {tab === 'mcp' && <McpSection />}
            {tab === 'tools' && <ToolsSection />}
          </div>
        </section>
      </div>
    </div>
  )
}
