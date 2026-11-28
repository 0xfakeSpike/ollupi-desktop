import { errorMessage } from '@ollupi/client'
import { Badge, Button, Dialog, Field, Input } from '@ollupi/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Profile } from '../../../../shared/ipc'
import { confirmRestart } from '../../domains/restart'
import { notify } from '../../domains/notices'
import { createProfile, deleteProfile, profileName, renameProfile, switchProfile, useProfile } from '../../domains/profile'
import { useConnection } from '../../gateway/connection'
import { useT } from '../../i18n'

/** The profiles of the backend, the one the window acts as first. The
 * operator's connection sees every one: switching to another, naming one,
 * deleting one not in use, and making a new one. Another connection sees
 * only its own, and names it. */
export function ProfilesSection() {
  const t = useT()
  const m = t.shell.profiles
  const list = useProfile((s) => s.list)
  const currentId = useProfile((s) => s.current)
  const operator = useProfile((s) => s.operator)
  // A server's token names the profile the connection acts as, so switching
  // or deleting from here would say one thing and do another.
  const onServer = useConnection((s) => s.backend.status === 'ready' && s.backend.server === true)
  const [making, setMaking] = useState(false)
  const [editing, setEditing] = useState<Profile>()
  const ordered = [...list.filter((p) => p.id === currentId), ...list.filter((p) => p.id !== currentId)]

  const remove = (p: Profile) => {
    // Deleting stops the backend while the store changes, so running turns
    // of every profile are interrupted.
    if (!confirm(m.deleteConfirm(profileName(p, m.unnamed))) || !confirmRestart()) return
    deleteProfile(p).catch((err: unknown) => notify(errorMessage(err)))
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-canvas rounded-3xl bg-surface">
        {ordered.map((p) => {
          const current = p.id === currentId
          return (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 truncate text-ui font-medium text-fg">{profileName(p, m.unnamed)}</span>
              {current && <Badge>{m.current}</Badge>}
              <span className="flex-1" />
              {/* The one in use is not deleted: switch away first, which a
                  server's token does not allow from here. */}
              {!current && operator && !onServer && (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => remove(p)}>
                  {m.delete}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(p)}>
                {m.edit}
              </Button>
              {!current && !onServer && (
                <Button size="sm" onClick={() => void switchProfile(p.id)}>
                  {m.switch}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {operator && (
        <div>
          <Button icon={<Plus size={14} />} onClick={() => setMaking(true)}>
            {m.create}
          </Button>
        </div>
      )}
      {onServer && <p className="text-small text-fg-subtle">{m.serverFixed}</p>}
      {making && <ProfileDialog onClose={() => setMaking(false)} />}
      {editing && <ProfileDialog profile={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}

/** What a profile is named: a new one, or the one being edited. */
function ProfileDialog({ profile, onClose }: { profile?: Profile; onClose(): void }) {
  const t = useT()
  const m = t.shell.profiles
  const onServer = useConnection((s) => s.backend.status === 'ready' && s.backend.server === true)
  const [name, setName] = useState(profile?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const rename = !!profile && name.trim() !== profile.name.trim()

  const save = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    setError(undefined)
    try {
      if (profile) {
        if (rename) await renameProfile(profile, name.trim())
      } else {
        const created = await createProfile(name.trim())
        // A server's token keeps the old profile; switching is editing the token.
        if (!onServer) await switchProfile(created.id)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={profile ? m.editTitle : m.createTitle}
      description={profile ? undefined : m.createDescription}
      closeLabel={t.common.close}
      onClose={onClose}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button size="lg" variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={m.name}>
          <Input autoFocus value={name} placeholder={m.namePlaceholder} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
        </Field>
        {error && <p className="text-small text-warning">{error}</p>}
      </div>
    </Dialog>
  )
}
