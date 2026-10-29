// What the agent can do, in one place: its skills, the MCP servers that give
// it tools, and every tool it can call, which permission rules name.

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
      <header className="drag flex h-10 shrink-0 items-center border-b border-line pl-4">
        <h1 className="text-ui font-semibold">{t.title}</h1>
      </header>
      <div className="scroll-centered flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pt-4 pb-8">
          <div className="border-b border-line">
            <Tabs<CapabilityTab> label={t.title} tabs={tabs} value={tab} onChange={(id) => go({ kind: 'capabilities', tab: id })} />
          </div>
          <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-5">
            <p className="text-ui text-fg-muted">{t.tabs[tab].description}</p>
            {tab === 'skills' && <SkillsSection />}
            {tab === 'mcp' && <McpSection />}
            {tab === 'tools' && <ToolsSection />}
          </section>
        </div>
      </div>
    </div>
  )
}
