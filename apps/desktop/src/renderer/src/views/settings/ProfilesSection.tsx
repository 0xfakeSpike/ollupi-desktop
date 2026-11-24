import { errorMessage } from '@ollupi/client'
import { Badge, Button, cn, Dialog, Field, Input } from '@ollupi/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Profile, ProfileColor } from '../../../../shared/ipc'
import { confirmRestart } from '../../domains/backendConfig'
import { notify } from '../../domains/notices'
import { createProfile, deleteProfile, profileName, switchProfile, updateProfile, useProfile } from '../../domains/profile'
import { useT } from '../../i18n'
import { ProfileDot } from '../common/ProfileDot'
import { PROFILE_COLORS } from '../common/profileColors'

/** Every profile on this Mac, the one the window acts as first: switching to
 * another, naming and colouring one, deleting one not in use, and making a
 * new one. */
export function ProfilesSection() {
  const t = useT()
  const m = t.shell.profiles
  const list = useProfile((s) => s.list)
  const currentId = useProfile((s) => s.current)
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
              <ProfileDot color={p.color} />
              <span className="min-w-0 truncate text-ui font-medium text-fg">{profileName(p, m.unnamed)}</span>
              {current && <Badge>{m.current}</Badge>}
              <span className="flex-1" />
              {/* The one in use is not deleted: switch away first. */}
              {!current && (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => remove(p)}>
                  {m.delete}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(p)}>
                {m.edit}
              </Button>
              {!current && (
                <Button size="sm" onClick={() => void switchProfile(p.id)}>
                  {m.switch}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <div>
        <Button icon={<Plus size={14} />} onClick={() => setMaking(true)}>
          {m.create}
        </Button>
      </div>
      {making && <ProfileDialog onClose={() => setMaking(false)} />}
      {editing && <ProfileDialog profile={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}

/** What a profile is named and coloured: a new one, or the one being edited. */
function ProfileDialog({ profile, onClose }: { profile?: Profile; onClose(): void }) {
  const t = useT()
  const m = t.shell.profiles
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState<ProfileColor>((profile?.color as ProfileColor | undefined) ?? (Object.keys(PROFILE_COLORS)[0] as ProfileColor))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const rename = !!profile && name.trim() !== profile.name.trim()
  const recolour = !!profile && color !== profile.color

  const save = async (): Promise<void> => {
    if (!profile && !name.trim()) return
    setSaving(true)
    setError(undefined)
    try {
      if (profile) {
        if (rename || recolour) await updateProfile(profile, name.trim(), color)
      } else {
        const created = await createProfile(name.trim(), color)
        await switchProfile(created.id)
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
          <Button size="lg" variant="primary" loading={saving} disabled={!profile && !name.trim()} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={m.name}>
          <Input autoFocus value={name} placeholder={m.namePlaceholder} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
        </Field>
        <Field label={m.color}>
          <Swatches value={color} onChange={setColor} />
        </Field>
        {error && <p className="text-small text-warning">{error}</p>}
      </div>
    </Dialog>
  )
}

/** The colours a profile may wear, each a dot to pick. */
function Swatches({ value, onChange }: { value: ProfileColor; onChange(color: ProfileColor): void }) {
  return (
    <div className="flex gap-2">
      {Object.entries(PROFILE_COLORS).map(([name, hex]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          aria-pressed={value === name}
          onClick={() => onChange(name as ProfileColor)}
          className={cn(
            'size-7 rounded-full ring-offset-2 ring-offset-canvas transition duration-100 ease-standard',
            'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
            value === name ? 'ring-2 ring-fg' : 'ring-1 ring-line hover:ring-line-strong',
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  )
}
