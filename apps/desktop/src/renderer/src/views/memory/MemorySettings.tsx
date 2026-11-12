// Memory's two switches in config.yaml: learning (memory.generate, with the
// model that extracts memories) and use (memory.use). They are read at the
// backend's start, so each one applies as it is flipped: the file changes
// and the backend restarts with it. A switch that only changed a draft
// until a save button was pressed looked done and was lost on leaving the
// page. The running backend reports what it actually uses in memory/status.

import type { MemoryStatus } from '@ollupi/protocol'
import { Button, Callout, Field, Select, Switch } from '@ollupi/ui'
import { RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ConfigChange } from '../../../../shared/ipc'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

export function MemorySettings({ status }: { status: MemoryStatus | undefined }) {
  const m = useT()
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  // Learning was switched on with no model to extract with: it waits for one.
  const [choosing, setChoosing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? setChecked(r) : setError(r?.error)))
  }, [])

  if (error) {
    return <Callout tone="danger">
        {m.memory.settings.unreadable} {error}
      </Callout>
  }
  if (!checked) return null

  const { config, models } = checked
  // The backend only accepts a memory model that is one of the models.
  const model = models.find((x) => x.id === config.memory.model)
  const learning = config.memory.generate || choosing
  // The file and the running backend disagree, e.g. after a hand edit.
  const stale = status && (status.generationEnabled !== config.memory.generate || status.useEnabled !== config.memory.use)

  /** Writes the changes and restarts the backend; the switches show the
   * file, so one the person declined or the backend refused flips back. */
  const apply = async (changes: ConfigChange[]): Promise<boolean> => {
    setSaving(true)
    const applied = await applyConfig(changes)
    if (applied) setChecked(applied)
    setSaving(false)
    return !!applied
  }
  const setLearning = (on: boolean) => {
    if (!on) {
      setChoosing(false)
      if (config.memory.generate) void apply([{ kind: 'set', path: ['memory', 'generate'], value: false }])
    } else if (model) {
      void apply([{ kind: 'set', path: ['memory', 'generate'], value: true }])
    } else {
      setChoosing(true)
    }
  }
  const setModel = async (id: string) => {
    const changes: ConfigChange[] = [{ kind: 'set', path: ['memory', 'model'], value: id }]
    if (!config.memory.generate) changes.unshift({ kind: 'set', path: ['memory', 'generate'], value: true })
    if (await apply(changes)) setChoosing(false)
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface px-5 py-4">
      <Row
        title={m.memory.settings.learn}
        hint={m.memory.settings.learnHint}
        control={<Switch label={m.memory.settings.learn} checked={learning} disabled={saving} onChange={setLearning} />}
      />
      {learning && (
        <div className="pl-0.5">
          <Field label={m.memory.settings.model} hint={model ? undefined : m.memory.settings.modelNeeded}>
            <Select className="max-w-72" value={model?.id ?? ''} disabled={saving} onChange={(e) => void setModel(e.target.value)}>
              {!model && <option value="">{m.memory.settings.chooseModel}</option>}
              {models.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <Row
        title={m.memory.settings.use}
        hint={m.memory.settings.useHint}
        control={
          <Switch label={m.memory.settings.use} checked={config.memory.use} disabled={saving} onChange={(on) => void apply([{ kind: 'set', path: ['memory', 'use'], value: on }])} />
        }
      />
      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-small text-fg-subtle">{stale && !saving ? m.memory.settings.stale : m.memory.settings.restarts}</span>
        {stale && !saving && (
          <Button size="sm" icon={<RotateCw size={14} />} onClick={() => void desktop.backend.restart()}>
            {m.common.restartBackend}
          </Button>
        )}
      </div>
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
