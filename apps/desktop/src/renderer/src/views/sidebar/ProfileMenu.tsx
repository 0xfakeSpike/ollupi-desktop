import { errorMessage } from '@ollupi/client'
import type { UserRow } from '@ollupi/protocol'
import { Button, cn, Dialog, Field, Input, Picker } from '@ollupi/ui'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { createProfile, currentProfile, profileName, recolorProfile, renameProfile, switchProfile, useProfile } from '../../domains/profile'
import { useT } from '../../i18n'
import { readConfig, applyConfig } from '../../domains/backendConfig'
import { FIRST_PROFILE } from '../../../../shared/ipc'
import { PROFILE_COLORS, profileColor } from './profileColors'

/** The profile the window acts as, at the sidebar's foot: its dot and name,
 * every profile to switch to, and the way to make one or change this one. */
export function ProfileMenu() {
  const t = useT()
  const m = t.shell.profiles
  const list = useProfile((s) => s.list)
  const currentId = useProfile((s) => s.current)
  const current = currentProfile()
  const [making, setMaking] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <Picker
        label={m.label}
        value={currentId}
        options={list.map((p) => ({
          value: p.id,
          label: (
            <span className="flex min-w-0 items-center gap-2">
              <Dot color={p.color} />
              <span className="truncate">{profileName(p, m.unnamed)}</span>
            </span>
          ),
          note: p.id === currentId ? m.current : undefined,
        }))}
        onChange={(id) => void switchProfile(id)}
        actions={[
          { label: m.create, onSelect: () => setMaking(true) },
          ...(current ? [{ label: m.edit, onSelect: () => setEditing(true) }] : []),
        ]}
        width={260}
        className="flex h-8 w-full items-center gap-2 rounded-full px-3 text-small font-medium text-fg-muted transition duration-100 ease-standard hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      >
        <Dot color={current?.color ?? ''} />
        <span className="min-w-0 truncate text-fg">{profileName(current, m.unnamed)}</span>
        <ChevronDown size={12} className="ml-auto shrink-0 opacity-60" aria-hidden />
      </Picker>
      {making && <ProfileDialog onClose={() => setMaking(false)} />}
      {editing && current && <ProfileDialog profile={current} onClose={() => setEditing(false)} />}
    </>
  )
}

/** A profile's dot: its colour, or the first when it has none yet. */
function Dot({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: profileColor(color) }} />
}

/** What a profile is named and coloured: a new one, or the one being edited. */
function ProfileDialog({ profile, onClose }: { profile?: UserRow; onClose(): void }) {
  const t = useT()
  const m = t.shell.profiles
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color || Object.keys(PROFILE_COLORS)[0]!)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const rename = !!profile && name.trim() !== profile.name.trim()
  const recolour = !!profile && color !== profile.color

  const save = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    setError(undefined)
    try {
      if (profile) {
        if (rename) await renameProfile(profile.id, name.trim())
        if (recolour) await recolorProfile(profile.id, color)
      } else {
        const created = await createProfile(name.trim(), color)
        // Its models are the caller's, copied into config.yaml under users:
        // a profile without its own has none to run.
        const checked = await readConfig()
        if (!checked?.ok) throw new Error(checked ? checked.error : m.needsModels)
        const from = currentProfile()
        const source = from && from.id !== FIRST_PROFILE ? checked.config.users?.find((u) => u.id === from.id)?.models : checked.config.models
        if (!source?.length) throw new Error(m.needsModels)
        const applied = await applyConfig([{ kind: 'set', path: ['users', checked.config.users?.length ?? 0], value: { id: created.id, models: source } }])
        if (!applied) throw new Error(m.needsModels)
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
        <Field label={m.color}>
          <Swatches value={color} onChange={setColor} />
        </Field>
        {error && <p className="text-small text-warning">{error}</p>}
      </div>
    </Dialog>
  )
}

/** The colours a profile may wear, each a dot to pick. */
function Swatches({ value, onChange }: { value: string; onChange(color: string): void }) {
  return (
    <div className="flex gap-2">
      {Object.entries(PROFILE_COLORS).map(([name, hex]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
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
