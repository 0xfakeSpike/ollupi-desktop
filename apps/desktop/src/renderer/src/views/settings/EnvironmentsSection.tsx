// Settings → Environments: where conversations can run. Each environment is
// a sandbox of one of the providers the backend offers, this computer among
// them. ollupi keeps the list and sends each change; the page only asks it
// to add, rename or delete one. A conversation keeps the environment it was started in and a
// workspace is a folder of one, so the user's first environment and any
// environment in use stay: ollupi refuses to remove them.

import type { EnvironmentRow } from '@ollupi/protocol'
import { Button, IconButton, Input, Select } from '@ollupi/ui'
import { Cloud, Laptop, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  addEnvironment,
  defaultEnvironment,
  deleteEnvironment,
  environmentName,
  LOCAL_PROVIDER,
  onThisMachine,
  providerName,
  renameEnvironment,
  useEnvironments,
} from '../../domains/environments'
import { useT } from '../../i18n'

export function EnvironmentsSection() {
  const t = useT().conversation.environments
  const list = useEnvironments((s) => s.list)
  const providers = useEnvironments((s) => s.providers)
  const first = defaultEnvironment(list)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<string | undefined>(undefined)
  const chosen = provider ?? providers[0]?.id ?? LOCAL_PROVIDER
  const add = async () => {
    const next = name.trim()
    if (!next) return
    // The list follows through environment/changed, whether the name was
    // taken or the backend refused it.
    if (await addEnvironment(next, chosen)) setName('')
  }
  return (
    <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
          {list.map((environment) => (
            <Row key={environment.id} environment={environment} first={environment.id === first?.id} />
          ))}
        </ul>
        <p className="-mt-2 text-small text-fg-subtle">{t.renameHint}</p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input
            value={name}
            aria-label={t.namePlaceholder}
            placeholder={t.namePlaceholder}
            className="min-w-0 flex-1"
            onChange={(e) => setName(e.target.value)}
          />
          {/* One provider needs no choosing: a new environment is another
              sandbox of it. */}
          {providers.length > 1 && (
            <Select aria-label={t.provider} className="max-w-40" value={chosen} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
          <Button type="submit" size="sm" disabled={!name.trim()}>
            {t.add}
          </Button>
        </form>
    </div>
  )
}

/** One environment: its name, renamed in place, what sandbox it is, and but
 * for the user's first the way to remove it. */
function Row({ environment, first }: { environment: EnvironmentRow; first: boolean }) {
  const t = useT().conversation.environments
  const providers = useEnvironments((s) => s.providers)
  const shown = environmentName(environment)
  const [name, setName] = useState(shown)
  // A rename lands through environment/changed, as does one made elsewhere.
  useEffect(() => setName(shown), [shown])
  const Icon = onThisMachine(environment) ? Laptop : Cloud

  const rename = async () => {
    const next = name.trim()
    if (!next || next === shown) {
      setName(shown)
      return
    }
    // A refused rename leaves the old name, which the input then shows again.
    if (!(await renameEnvironment(environment.id, next))) setName(shown)
  }

  const remove = async () => {
    if (!confirm(t.removeConfirm(shown))) return
    await deleteEnvironment(environment.id)
  }

  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <Icon size={14} className="shrink-0 text-fg-muted" aria-hidden />
      <Input
        value={name}
        aria-label={t.rename}
        className="h-6 max-w-52 border-transparent px-1.5"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void rename()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setName(shown)
        }}
      />
      <span className="min-w-0 flex-1 truncate text-small text-fg-subtle">{first ? t.firstStays : providerName(environment.provider, providers)}</span>
      {!first && (
        <IconButton label={`${t.remove} ${shown}`} size="sm" onClick={() => void remove()}>
          <Trash2 size={14} />
        </IconButton>
      )}
    </li>
  )
}
