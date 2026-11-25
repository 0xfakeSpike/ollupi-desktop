// The platform's screens, each one thing: the models every profile runs on
// and the tokens they used. The operator sets the models; a profile without
// the operator's rights sees them and picks among them (ModelsSection).

import { useT } from '../../i18n'
import { Page } from '../common/Page'
import { ModelsSection } from './ModelsSection'
import { UsageSection } from './UsageSection'

export function ModelsScreen() {
  const t = useT().settings.screen.sections.models
  return (
    <Page title={t.label} description={t.description}>
      <ModelsSection />
    </Page>
  )
}

export function UsageScreen() {
  const t = useT().settings.screen.sections.usage
  return (
    <Page title={t.label} description={t.description}>
      <UsageSection />
    </Page>
  )
}
