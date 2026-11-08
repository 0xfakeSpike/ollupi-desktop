// Where conversations can run: this computer, which every user has, and the
// cloud sandboxes they name. ollupi keeps the list and sends each change; the
// dialog only asks it to add, rename or delete one. A conversation keeps the
// environment it was started in, so this machine and any environment in use
// stay: ollupi refuses to remove them.

import type { EnvironmentRow } from '@ollupi/protocol'
import { Button, Dialog, IconButton, Input } from '@ollupi/ui'
import { Cloud, Laptop, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addEnvironment, deleteEnvironment, renameEnvironment, useEnvironments } from '../../domains/environments'
import { useT } from '../../i18n'

export function EnvironmentDialog({ onClose }: { onClose(): void }) {
  const m = useT()
  const t = m.conversation.environments
  const list = useEnvironments((s) => s.list)
  const [name, setName] = useState('')
  const add = async () => {
    const next = name.trim()
    if (!next) return
    // The list follows through environment/changed, whether the name was
    // taken or the backend refused it.
    if (await addEnvironment(next)) setName('')
  }
  return (
    <Dialog title={t.title} description={t.description} closeLabel={m.common.close} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {list.map((environment) => (
            <Row key={environment.id} environment={environment} />
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
          <Button type="submit" size="sm" disabled={!name.trim()}>
            {t.add}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}

/** One environment: its name, renamed in place, and for a cloud sandbox the
 * way to remove it. */
function Row({ environment }: { environment: EnvironmentRow }) {
  const t = useT().conversation.environments
  const [name, setName] = useState(environment.name)
  // A rename lands through environment/changed, as does one made elsewhere.
  useEffect(() => setName(environment.name), [environment.name])
  const local = environment.kind === 'local'
  const Icon = local ? Laptop : Cloud

  const rename = async () => {
    const next = name.trim()
    if (!next || next === environment.name) {
      setName(environment.name)
      return
    }
    // A refused rename leaves the old name, which the input then shows again.
    if (!(await renameEnvironment(environment.id, next))) setName(environment.name)
  }

  const remove = async () => {
    if (!confirm(t.removeConfirm(environment.name))) return
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
          if (e.key === 'Escape') setName(environment.name)
        }}
      />
      <span className="min-w-0 flex-1 truncate text-small text-fg-subtle">{local ? t.localStays : t.machine}</span>
      {!local && (
        <IconButton label={`${t.remove} ${environment.name}`} size="sm" onClick={() => void remove()}>
          <Trash2 size={14} />
        </IconButton>
      )}
    </li>
  )
}
