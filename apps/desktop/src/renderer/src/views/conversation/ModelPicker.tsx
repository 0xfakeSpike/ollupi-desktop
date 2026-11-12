import { cn, Picker, type PickerOption } from '@ollupi/ui'
import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import { useModels } from '../../domains/models'
import { chooseModel, useNavigation } from '../../domains/navigation'
import { useT } from '../../i18n'
import { chip } from './Composer'

/** Past this many models the list gets a filter box. */
const FILTER_FROM = 8

/** Chooses the model for the next turn. Without a choice the turn is sent
 * without a connection and the server continues with `inherited` (the
 * thread's last model), or its fallback for a thread with no turns. A
 * connection is the backend's provider/name, which names the model and the
 * API serving it, so the list is grouped by provider. */
export function ModelPicker({ inherited }: { inherited: string | undefined }) {
  const models = useModels((s) => s.list)
  const fallback = useModels((s) => s.fallback)
  const chosen = useNavigation((s) => s.model)
  const t = useT().conversation.modelPicker
  const shown = chosen ?? inherited ?? fallback
  // The thread's last model was removed from config.yaml or renamed: the
  // server refuses to continue on it until another is chosen.
  const unavailable = !models.some((m) => m.connection === shown)
  const options = useMemo(
    () =>
      models.map((m): PickerOption<string> => {
        const slash = m.connection.indexOf('/')
        return {
          value: m.connection,
          label: slash < 0 ? m.connection : m.connection.slice(slash + 1),
          group: slash < 0 ? undefined : m.connection.slice(0, slash),
          search: m.connection,
          note: m.connection === fallback ? t.default : undefined,
        }
      }),
    [models, fallback, t],
  )
  if (models.length === 0) return null
  return (
    <Picker
      label={t.label}
      value={shown}
      options={options}
      onChange={chooseModel}
      className={cn(chip, 'gap-1')}
      filter={models.length > FILTER_FROM ? { placeholder: t.filter, empty: t.noMatch } : undefined}
    >
      <span className={cn('truncate', unavailable && 'text-warning')}>{unavailable ? t.unavailable(shown) : shown}</span>
      <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />
    </Picker>
  )
}
