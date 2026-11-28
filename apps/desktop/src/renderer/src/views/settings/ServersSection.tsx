import { errorMessage } from '@ollupi/client'
import { Badge, Button, cn, Dialog, Field, Input } from '@ollupi/ui'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LOCAL_SERVER, type ServerSettings, type ServersSettings } from '../../../../shared/ipc'
import { confirmRestart } from '../../domains/restart'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

/** The servers on file, and switching to one. A switch starts another
 * backend, so it is confirmed first, and one runs at a time. */
function useServers() {
  const [state, setState] = useState<ServersSettings>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const reload = useCallback(() => {
    void desktop.servers.read().then(setState).catch((err: unknown) => setError(errorMessage(err)))
  }, [])
  useEffect(reload, [reload])

  const switchTo = async (id: string): Promise<void> => {
    if (id === state?.active || !confirmRestart()) return
    setError(undefined)
    setBusy(id)
    try {
      await desktop.servers.select(id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(undefined)
    }
  }

  return { state, busy, error, setError, reload, switchTo }
}

/** One row of a server list: its name and address, whether it is the one in
 * use, and the actions of the list it appears in. */
function ServerLine({ name, detail, mono = true, inUse, children }: { name: string; detail?: string; mono?: boolean; inUse: boolean; children?: ReactNode }) {
  const t = useT().settings.servers
  return (
    <li className="flex min-h-12 items-center gap-3 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-ui font-medium text-fg">{name}</div>
        {detail && <div className={cn('selectable truncate text-small text-fg-muted', mono && 'font-mono')}>{detail}</div>}
      </div>
      {inUse && <Badge>{t.inUse}</Badge>}
      {children}
    </li>
  )
}

/** The backend this app runs, first in both lists. */
function LocalServerLine({ active, busy, switchTo }: { active: string; busy?: string; switchTo(id: string): void }) {
  const t = useT().settings.servers
  return (
    <ServerLine name={t.local} detail={t.localHint} mono={false} inUse={active === LOCAL_SERVER}>
      {active !== LOCAL_SERVER && (
        <Button size="sm" loading={busy === LOCAL_SERVER} onClick={() => switchTo(LOCAL_SERVER)}>
          {t.use}
        </Button>
      )}
    </ServerLine>
  )
}

/** The ollupi servers this app connects to: the backend it runs itself
 * first, then the ones registered — on another machine, behind a tunnel, or
 * started on this Mac. The one in use is marked; another one is switched to,
 * edited or removed. */
export function ServersSection() {
  const m = useT()
  const t = m.settings.servers
  const { state, busy, error, setError, reload, switchTo } = useServers()
  const [editing, setEditing] = useState<ServerSettings | 'new'>()

  // Nothing before the servers are read, so the list never names a guess.
  if (!state) return error ? <p className="text-small text-warning">{error}</p> : null
  const active = state.active

  const remove = async (server: ServerSettings): Promise<void> => {
    if (!confirm(t.removeConfirm(server.name))) return
    setError(undefined)
    try {
      await desktop.servers.remove(server.id)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        <LocalServerLine active={active} busy={busy} switchTo={(id) => void switchTo(id)} />
        {state.servers.map((server) => {
          const inUse = server.id === active
          return (
            <ServerLine key={server.id} name={server.name} detail={server.url} inUse={inUse}>
              {/* The one in use is not removed: switch away first. */}
              {!inUse && (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => void remove(server)}>
                  {t.remove}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(server)}>
                {t.edit}
              </Button>
              {!inUse && (
                <Button size="sm" loading={busy === server.id} onClick={() => void switchTo(server.id)}>
                  {t.use}
                </Button>
              )}
            </ServerLine>
          )
        })}
      </ul>
      <div>
        <Button icon={<Plus size={14} />} onClick={() => setEditing('new')}>
          {t.add}
        </Button>
      </div>
      {error && <p className="text-small text-warning">{error}</p>}
      {editing && <ServerDialog server={editing === 'new' ? undefined : editing} onSaved={reload} onClose={() => setEditing(undefined)} />}
    </>
  )
}

/** A server's name, address, gateway token and Access service token. The
 * secrets kept are never shown: an empty field keeps them. */
function ServerDialog({ server, onSaved, onClose }: { server?: ServerSettings; onSaved(): void; onClose(): void }) {
  const m = useT()
  const t = m.settings.servers
  const [name, setName] = useState(server?.name ?? '')
  const [url, setUrl] = useState(server?.url ?? '')
  const [token, setToken] = useState('')
  const [accessClientId, setAccessClientId] = useState(server?.accessClientId ?? '')
  const [accessClientSecret, setAccessClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(undefined)
    try {
      await desktop.servers.save({ id: server?.id, name, url, token, accessClientId, accessClientSecret })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={server ? t.editTitle : t.addTitle}
      description={t.description}
      closeLabel={m.common.close}
      onClose={onClose}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" loading={saving} onClick={() => void save()}>
            {m.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.name} hint={t.nameHint}>
          <Input value={name} placeholder={t.namePlaceholder} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.url} hint={t.urlHint}>
          <Input value={url} placeholder="wss://ollupi.example.com" spellCheck={false} autoFocus={!server} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label={t.token} hint={t.tokenHint}>
          <Input
            type="password"
            value={token}
            placeholder={server?.hasToken ? t.kept : '<secret>.<profile>'}
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <Field label={t.accessId}>
          <Input value={accessClientId} placeholder="…….access" spellCheck={false} autoComplete="off" onChange={(e) => setAccessClientId(e.target.value)} />
        </Field>
        <Field label={t.accessSecret} hint={t.accessHint}>
          <Input
            type="password"
            value={accessClientSecret}
            placeholder={server?.hasAccessSecret ? t.kept : undefined}
            autoComplete="off"
            onChange={(e) => setAccessClientSecret(e.target.value)}
          />
        </Field>
        <p className="text-small text-fg-subtle">{t.encrypted}</p>
        {error && <p className="text-small text-warning">{error}</p>}
      </div>
    </Dialog>
  )
}

/** Which server to connect to, for when the settings are out of reach
 * because the backend cannot be reached: the same list, without editing. */
export function ServersDialog({ onClose }: { onClose(): void }) {
  const m = useT()
  const t = m.settings.servers
  const { state, busy, error, switchTo } = useServers()
  const active = state?.active ?? ''

  return (
    <Dialog
      title={t.pickerTitle}
      description={t.pickerDescription}
      closeLabel={m.common.close}
      onClose={onClose}
      footer={
        <Button size="lg" onClick={onClose}>
          {m.common.close}
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        <LocalServerLine active={active} busy={busy} switchTo={(id) => void switchTo(id)} />
        {(state?.servers ?? []).map((server) => {
          const inUse = server.id === active
          return (
            <ServerLine key={server.id} name={server.name} detail={server.url} inUse={inUse}>
              {!inUse && (
                <Button size="sm" loading={busy === server.id} onClick={() => void switchTo(server.id)}>
                  {t.use}
                </Button>
              )}
            </ServerLine>
          )
        })}
      </ul>
      {error && <p className="mt-3 text-small text-warning">{error}</p>}
    </Dialog>
  )
}
