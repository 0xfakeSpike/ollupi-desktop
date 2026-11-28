// Settings → Environments: where conversations can run. Each environment is
// a sandbox of one of the providers the backend offers, this computer among
// them. ollupi keeps the list and sends each change; the page only asks it
// to add, rename or delete one. A conversation keeps the environment it was started in and a
// workspace is a folder of one, so the user's first environment and any
// environment in use stay: ollupi refuses to remove them.
//
// Cloudflare's sandbox is one of those providers, and choosing it is how the
// backend gets one: its bridge is asked for here, the first time.

import { errorMessage } from '@ollupi/client'
import type { EnvironmentRow } from '@ollupi/protocol'
import { Button, Field, IconButton, Input, Select } from '@ollupi/ui'
import { Cloud, Laptop, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SandboxSettings } from '../../../../shared/ipc'
import {
  addEnvironment,
  CLOUDFLARE_PROVIDER,
  defaultEnvironment,
  deleteEnvironment,
  environmentName,
  environmentSyncs,
  LOCAL_PROVIDER,
  onThisMachine,
  providerName,
  renameEnvironment,
  useEnvironments,
  whenProviderArrives,
} from '../../domains/environments'
import { confirmRestart } from '../../domains/restart'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

export function EnvironmentsSection() {
  const m = useT()
  const t = m.conversation.environments
  const cloud = m.settings.cloudflare
  const list = useEnvironments((s) => s.list)
  const providers = useEnvironments((s) => s.providers)
  // The bridge belongs to the backend this Mac runs; a server brings the
  // sandboxes it was started with.
  const onServer = useConnection((s) => s.backend.status === 'ready' && s.backend.server === true)
  const first = defaultEnvironment(list)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  // The backend's providers, and Cloudflare even before this Mac's backend
  // has a bridge: choosing it is how one is given.
  const choices = [
    { id: LOCAL_PROVIDER, name: providerName(LOCAL_PROVIDER, providers) },
    ...providers.filter((p) => p.id !== LOCAL_PROVIDER).map((p) => ({ id: p.id, name: p.name })),
  ]
  if (!onServer && !choices.some((c) => c.id === CLOUDFLARE_PROVIDER)) choices.push({ id: CLOUDFLARE_PROVIDER, name: cloud.title })
  const chosen = provider ?? providers[0]?.id ?? LOCAL_PROVIDER
  const withBridge = chosen === CLOUDFLARE_PROVIDER && !onServer

  // The bridge, kept for the fields that give it.
  const [bridge, setBridge] = useState<SandboxSettings>()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const loadBridge = useCallback(() => {
    void desktop.sandbox
      .read()
      .then((s) => {
        setBridge(s)
        setUrl(s.url)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])
  useEffect(loadBridge, [loadBridge])

  const add = async (): Promise<void> => {
    const named = name.trim()
    if (!named) return
    if (!withBridge) {
      // The list follows through environment/changed, whether the name was
      // taken or the backend refused it.
      if (await addEnvironment(named, chosen)) setName('')
      return
    }
    // A Cloudflare sandbox needs the bridge first: saving it builds the
    // backend again, and the environment follows the backend that offers it.
    setBusy(true)
    setError(undefined)
    try {
      const changed = !bridge?.hasKey || url !== bridge.url || !!token.trim()
      if (changed) {
        // Another backend starts, and the turns running here stop with it.
        if (!confirmRestart()) return
        const synced = environmentSyncs()
        await desktop.sandbox.save({ url, key: token })
        setToken('')
        if (!(await whenProviderArrives(synced, CLOUDFLARE_PROVIDER))) throw new Error(cloud.notStarted)
        loadBridge()
      }
      if (await addEnvironment(named, CLOUDFLARE_PROVIDER)) setName('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const forgetBridge = async (): Promise<void> => {
    if (!confirm(cloud.removeConfirm)) return
    setBusy(true)
    setError(undefined)
    try {
      await desktop.sandbox.clear()
      loadBridge()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
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
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            value={name}
            aria-label={t.namePlaceholder}
            placeholder={t.namePlaceholder}
            className="min-w-0 flex-1"
            onChange={(e) => setName(e.target.value)}
          />
          {/* One provider needs no choosing: a new environment is another
              sandbox of it. */}
          {choices.length > 1 && (
            <Select aria-label={t.provider} className="max-w-40" value={chosen} onChange={(e) => setProvider(e.target.value)}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
            {t.add}
          </Button>
        </div>
        {/* Cloudflare's sandbox: its bridge, which this Mac's backend asks
            for once. */}
        {withBridge && (
          <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
            <p className="text-small text-fg-subtle">{cloud.firstHint}</p>
            <Field label={cloud.url} hint={cloud.urlHint}>
              <Input value={url} placeholder="https://sandbox-bridge.example.workers.dev" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label={cloud.token} hint={cloud.tokenHint}>
              <Input
                type="password"
                value={token}
                placeholder={bridge?.hasKey ? cloud.kept : undefined}
                autoComplete="off"
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
            {bridge?.url && (
              <div>
                <Button type="button" size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => void forgetBridge()}>
                  {cloud.remove}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-small text-warning">{error}</p>}
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
