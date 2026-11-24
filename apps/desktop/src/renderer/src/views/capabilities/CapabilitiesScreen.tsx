// What the agent can do, in one place: its skills, the MCP servers that give
// it tools, and the tools it has built in.

import { Tabs } from '@ollupi/ui'
import { go, type CapabilityTab } from '../../domains/navigation'
import { useT } from '../../i18n'
import { NavPage } from '../common/NavPage'
import { McpSection } from './McpSection'
import { SkillsSection } from './SkillsSection'
import { ToolsSection } from './ToolsSection'

const tabIds: CapabilityTab[] = ['skills', 'mcp', 'tools']

export function CapabilitiesScreen({ tab }: { tab: CapabilityTab }) {
  const t = useT().capabilities
  const tabs = tabIds.map((id) => ({ id, label: t.tabs[id].label }))
  return (
    <NavPage
      title={t.title}
      nav={<Tabs<CapabilityTab> label={t.title} orientation="auto" tabs={tabs} value={tab} onChange={(id) => go({ kind: 'capabilities', tab: id })} />}
      panel={{ role: 'tabpanel', id: `panel-${tab}`, 'aria-labelledby': `tab-${tab}` }}
    >
      <p className="text-ui text-fg-muted">{t.tabs[tab].description}</p>
      {tab === 'skills' && <SkillsSection />}
      {tab === 'mcp' && <McpSection />}
      {tab === 'tools' && <ToolsSection />}
    </NavPage>
  )
}
