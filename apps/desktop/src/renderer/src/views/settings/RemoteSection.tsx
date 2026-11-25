import { errorMessage } from '@ollupi/client'
import { Button, Dialog, Field, Input, Switch } from '@ollupi/ui'
import { useEffect, useState } from 'react'
import type { RemoteSettings } from '../../../../shared/ipc'
import { confirmRestart } from '../../domains/backendConfig'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

/** Which ollupid the window talks to, and the button that changes it. */
export function RemoteSection() {
  const t = useT().settings.remote
  const [settings, setSettings] = useState<RemoteSettings>()
  const [editing, setEditing] = useState(false)
  useEffect(() => void desktop.remote.read().then(setSettings), [editing])
  return (
    <>
      <div className="flex min-h-12 items-center gap-4 rounded-3xl bg-surface px-5 py-2.5">
        <span className="w-24 shrink-0 text-ui text-fg">{t.mode}</span>
        <span className="selectable min-w-0 flex-1 truncate font-mono text-small text-fg-muted">
          {settings?.enabled ? t.remoteAt(settings.url) : t.local}
        </span>
        <Button size="sm" onClick={() => setEditing(true)}>
          {t.edit}
        </Button>
      </div>
      {editing && <RemoteDialog onClose={() => setEditing(false)} />}
    </>
  )
}

/** The remote's address, its gateway token and the Access service token.
 * The secrets kept are never shown: an empty field keeps them. */
export function RemoteDialog({ onClose }: { onClose(): void }) {
  const m = useT()
  const t = m.settings.remote
  const [kept, setKept] = useState<RemoteSettings>()
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [accessClientId, setAccessClientId] = useState('')
  const [accessClientSecret, setAccessClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void desktop.remote.read().then((s) => {
      setKept(s)
      setEnabled(s.enabled)
      setUrl(s.url)
      setAccessClientId(s.accessClientId)
    })
  }, [])

  const save = async (): Promise<void> => {
    // Going remote stops the backend this Mac runs, and its turns with it.
    if (enabled && !kept?.enabled && !confirmRestart()) return
    setSaving(true)
    setError(undefined)
    try {
      await desktop.remote.save({ enabled, url, token, accessClientId, accessClientSecret })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={t.title}
      description={t.description}
      closeLabel={m.common.close}
      onClose={onClose}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button size="lg" variant="primary" loading={saving} disabled={!kept} onClick={() => void save()}>
            {m.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="min-w-0 flex-1 text-ui font-medium text-fg">{t.enabled}</span>
          <Switch label={t.enabled} checked={enabled} onChange={setEnabled} />
        </div>
        <Field label={t.url} hint={t.urlHint}>
          <Input value={url} placeholder="wss://ollupi.example.com" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label={t.token} hint={t.tokenHint}>
          <Input type="password" value={token} placeholder={kept?.hasToken ? t.kept : '<secret>.<profile>'} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
        </Field>
        <Field label={t.accessId}>
          <Input value={accessClientId} placeholder="…….access" spellCheck={false} autoComplete="off" onChange={(e) => setAccessClientId(e.target.value)} />
        </Field>
        <Field label={t.accessSecret} hint={t.accessHint}>
          <Input
            type="password"
            value={accessClientSecret}
            placeholder={kept?.hasAccessSecret ? t.kept : undefined}
            autoComplete="off"
            onChange={(e) => setAccessClientSecret(e.target.value)}
          />
        </Field>
        <p className="text-small text-fg-subtle">
          {t.encrypted} {(enabled || kept?.enabled) && t.switching}
        </p>
        {error && <p className="text-small text-warning">{error}</p>}
      </div>
    </Dialog>
  )
}
