import type { Model } from '@ollupi/protocol'
import { ChevronDown, Cpu } from 'lucide-react'
import { useCatalog } from '../../stores/catalog'
import { useNavigation } from '../../stores/navigation'

/** Chooses the model for the next turn. Without an explicit choice the server
 * keeps the thread's last model (or the default for a new thread). */
export function ModelPicker({ fallback }: { fallback: string | undefined }) {
  const models = useCatalog((s) => s.models)
  const defaultModel = useCatalog((s) => s.defaultModel)
  const chosen = useNavigation((s) => s.model)
  const setModel = useNavigation((s) => s.setModel)
  const value = chosen ?? fallback ?? defaultModel
  if (models.length === 0) return null

  return (
    <label className="relative flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg">
      <Cpu size={13} />
      <span className="max-w-48 truncate">{labelOf(models.find((m) => m.connection === value)) || value}</span>
      <ChevronDown size={12} />
      <select
        aria-label="Model"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(e) => setModel(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.connection} value={m.connection}>
            {labelOf(m)}
          </option>
        ))}
      </select>
    </label>
  )
}

function labelOf(m: Model | undefined): string {
  if (!m) return ''
  return m.connection === m.name ? m.name : `${m.connection} · ${m.name}`
}
