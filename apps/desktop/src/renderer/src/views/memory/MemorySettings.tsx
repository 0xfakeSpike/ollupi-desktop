// Memory's settings, all of them this profile's, in ollupi, applying from
// the next call or turn: whether it is on, whether it learns, and the model
// that learns, one of those the backend serves. Off, memory is neither
// recalled nor searched and nothing is learned; learning off keeps using the
// memories kept and learns nothing from the turns that end meanwhile. Each
// applies as it is changed: a choice that only changed a draft until a save
// button was pressed looked done and was lost on leaving the page.

import { Field, Select, Switch } from '@ollupi/ui'
import type { ReactNode } from 'react'
import { useModels } from '../../domains/models'
import { setLearn, setLearnModel, setMemory, useSettings } from '../../domains/settings'
import { useT } from '../../i18n'

export function MemorySettings() {
  const m = useT()
  const settings = useSettings((s) => s.settings)
  const models = useModels((s) => s.list)
  if (!settings) return null
  const t = m.memory.settings
  // A choice the backend no longer serves learns nothing, as none.
  const model = models.find((x) => x.connection === settings.learnModel)

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface px-5 py-4">
      <Row title={t.use} hint={t.useHint} control={<Switch label={t.use} checked={settings.memory} onChange={(next) => void setMemory(next)} />} />
      {settings.memory && <Row title={t.learn} hint={t.learnHint} control={<Switch label={t.learn} checked={settings.learn} onChange={(next) => void setLearn(next)} />} />}
      {settings.memory && settings.learn && (
        <div className="pl-0.5">
          <Field label={t.model} hint={model ? t.modelHint : t.modelNeeded}>
            <Select className="max-w-72" value={model?.connection ?? ''} onChange={(e) => void setLearnModel(e.target.value)}>
              {!model && (
                <option value="" disabled>
                  {t.chooseModel}
                </option>
              )}
              {models.map((x) => (
                <option key={x.connection} value={x.connection}>
                  {x.connection}
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
