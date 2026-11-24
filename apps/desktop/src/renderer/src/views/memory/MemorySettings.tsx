// Memory's settings. Whether it is on, and whether it learns, are the
// user's, in ollupi, and apply from the next call or turn. Off, memory is
// neither recalled nor searched and nothing is learned; learning off keeps
// using the memories kept and learns nothing from the turns that end
// meanwhile. The model that learns is this profile's config.yaml entry, read
// at the backend's start: choosing one changes the file and restarts the
// backend with it. Each applies as it is changed: a choice that only changed
// a draft until a save button was pressed looked done and was lost on leaving
// the page.

import { Callout, Field, Select, Switch } from '@ollupi/ui'
import { useState, type ReactNode } from 'react'
import { applyProfileConfig, type CheckedConfig } from '../../domains/backendConfig'
import { profileConfig } from '../../../../shared/profileConfig'
import { useProfile } from '../../domains/profile'
import { setLearn, setMemory, useSettings } from '../../domains/settings'
import { useT } from '../../i18n'

export function MemorySettings({ config }: { config: { checked: CheckedConfig | undefined; error: string | undefined; set(c: CheckedConfig): void } }) {
  const m = useT()
  const settings = useSettings((s) => s.settings)
  const current = useProfile((s) => s.current)
  const [saving, setSaving] = useState(false)

  if (config.error) {
    return (
      <Callout tone="danger">
        {m.memory.settings.unreadable} {config.error}
      </Callout>
    )
  }
  const { checked } = config
  if (!checked || !settings) return null
  const t = m.memory.settings

  // The backend only accepts a memory model that is one of this profile's.
  const scope = profileConfig(checked.config, current)
  const models = scope.models.flatMap((p) => p.names.map((n) => ({ id: `${p.provider}/${n.name}`, provider: p.provider, name: n.name })))
  const model = models.find((x) => x.id === scope.memory?.model)
  const setModel = async (id: string) => {
    setSaving(true)
    if (!current) return
    const applied = await applyProfileConfig(current, { kind: 'setMemoryModel', model: id })
    if (applied) config.set(applied)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface px-5 py-4">
      <Row title={t.use} hint={t.useHint} control={<Switch label={t.use} checked={settings.memory} onChange={(next) => void setMemory(next)} />} />
      {settings.memory && <Row title={t.learn} hint={t.learnHint} control={<Switch label={t.learn} checked={settings.learn} onChange={(next) => void setLearn(next)} />} />}
      {settings.memory && settings.learn && (
        <div className="pl-0.5">
          <Field label={t.model} hint={model ? t.modelHint : t.modelNeeded}>
            <Select className="max-w-72" value={model?.id ?? ''} disabled={saving} onChange={(e) => void setModel(e.target.value)}>
              {!model && (
                <option value="" disabled>
                  {t.chooseModel}
                </option>
              )}
              {models.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}

function Row({ title, hint, control }: { title: string; hint: string; control: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-ui font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-small text-fg-muted">{hint}</div>
      </div>
      {control}
    </div>
  )
}
