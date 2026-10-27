import { cn } from '@ollupi/ui'
import { ChevronDown, Cpu } from 'lucide-react'
import { useModels } from '../../domains/models'
import { chooseModel, useNavigation } from '../../domains/navigation'
import { useT } from '../../i18n'

/** Chooses the model for the next turn. Without a choice the turn is sent
 * without a connection and the server continues with `inherited` (the
 * thread's last model), or its fallback for a thread with no turns. A
 * connection is the backend's provider/name, which names the model and the
 * API serving it. */
export function ModelPicker({ inherited }: { inherited: string | undefined }) {
  const models = useModels((s) => s.list)
  const fallback = useModels((s) => s.fallback)
  const chosen = useNavigation((s) => s.model)
  const t = useT().conversation.modelPicker
  const shown = chosen ?? inherited ?? fallback
  // The thread's last model was removed from config.yaml or renamed: the
  // server refuses to continue on it until another is chosen.
  const unavailable = !models.some((m) => m.connection === shown)
  if (models.length === 0) return null
  return (
    <label className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-small text-fg-muted transition-colors duration-100 ease-standard hover:bg-hover hover:text-fg">
      <Cpu size={14} />
      <span className={cn('max-w-72 truncate', unavailable && 'text-warning')}>{unavailable ? t.unavailable(shown) : shown}</span>
      <ChevronDown size={14} />
      <select aria-label={t.label} className="absolute inset-0 cursor-pointer opacity-0" value={shown} onChange={(e) => chooseModel(e.target.value)}>
        {unavailable && (
          <option value={shown} disabled>
            {t.unavailable(shown)}
          </option>
        )}
        {models.map((m) => (
          <option key={m.connection} value={m.connection}>
            {m.connection}
          </option>
        ))}
      </select>
    </label>
  )
}
