// When a message was written: small and quiet, as meta (DESIGN.md 1.2), the
// full date and time in its tooltip. A minute is enough to say; it does not
// tick.

import { useTooltip } from '@ollupi/ui'
import { useLocale, useT } from '../../../i18n'
import { clockTime, fullTime } from '../../../i18n/format'

export function MessageTime({ at, className }: { at: string | null | undefined; className?: string }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  const full = at ? fullTime(locale, at) : ''
  const { trigger, tooltip } = useTooltip({ label: full })
  if (!at) return null
  const shown = clockTime(m, locale, at)
  if (!shown) return null
  return (
    <>
      <time dateTime={at} className={className ?? 'text-small text-fg-subtle tabular-nums'} {...trigger}>
        {shown}
      </time>
      {tooltip}
    </>
  )
}
