// Settings → Environments: where conversations can run. Each environment is
// a sandbox of one of the providers the backend offers, this computer among
// them. ollupi keeps the list and sends each change; the page only asks it
// to add, rename or delete one. A conversation keeps the environment it was started in and a
// workspace is a folder of one, so the user's first environment and any
// environment in use stay: ollupi refuses to remove them.

import { errorMessage } from '@ollupi/client'
import type { EnvironmentRow } from '@ollupi/protocol'
import { Button, Field, IconButton, Input, Select } from '@ollupi/ui'
import { Cloud, Laptop, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SandboxSettings } from '../../../../shared/ipc'
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
import { confirmRestart } from '../../domains/restart'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

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
        <CloudSandbox />
    </div>
  )
}

/** The Cloudflare sandbox bridge this Mac's backend offers, if the person
 * gave it one: environments built there run in a container of their own. A
 * server's backend offers whatever it was started with, so this is this
 * Mac's alone. */
function CloudSandbox() {
  const m = useT()
  const t = m.settings.cloudflare
  // The bridge is the backend's, which a server's connection is not.
  const onServer = useConnection((s) => s.backend.status === 'ready' && s.backend.server === true)
  const [state, setState] = useState<SandboxSettings>()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const reload = useCallback(() => {
    void desktop.sandbox
      .read()
      .then((s) => {
        setState(s)
        setUrl(s.url)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])
  useEffect(reload, [reload])

  if (onServer) return <p className="text-small text-fg-subtle">{t.onServer}</p>

  const save = async (): Promise<void> => {
    // Another backend starts, and the turns running here stop with it.
    if (!confirmRestart()) return
    setBusy(true)
    setError(undefined)
    try {
      await desktop.sandbox.save({ url, key })
      setKey('')
      reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    if (!confirm(t.removeConfirm)) return
    setBusy(true)
    setError(undefined)
    try {
      await desktop.sandbox.clear()
      reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-ui font-medium text-fg">{t.title}</h3>
        <p className="text-small text-fg-subtle">{t.description}</p>
      </div>
      <Field label={t.url} hint={t.urlHint}>
        <Input value={url} placeholder="https://sandbox-bridge.example.workers.dev" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label={t.token} hint={t.tokenHint}>
        <Input
          type="password"
          value={key}
          placeholder={state?.hasKey ? t.kept : undefined}
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" loading={busy} disabled={!url.trim()} onClick={() => void save()}>
          {m.common.save}
        </Button>
        {state?.url && (
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => void clear()}>
            {t.remove}
          </Button>
        )}
      </div>
      {error && <p className="text-small text-warning">{error}</p>}
    </section>
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
