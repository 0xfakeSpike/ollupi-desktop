// Memory's two switches in config.yaml: learning (memory.generate, with the
// model that extracts memories) and use (memory.use). They are read at the
// backend's start, so saving restarts it; the running backend reports what
// it actually uses in memory/status.

import type { MemoryStatus } from '@ollupi/protocol'
import { Button, Callout, Field, Select, Switch } from '@ollupi/ui'
import { RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import { useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

export function MemorySettings({ status }: { status: MemoryStatus | undefined }) {
  const m = useT()
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  const [generate, setGenerate] = useState(false)
  const [use, setUse] = useState(false)
  const [modelId, setModelId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = (c: CheckedConfig) => {
    setChecked(c)
    setGenerate(c.config.memory.generate)
    setUse(c.config.memory.use)
    setModelId(c.config.memory.model ?? '')
  }
  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? load(r) : setError(r?.error)))
  }, [])

  if (error) {
    return <Callout tone="danger">
        {m.memory.settings.unreadable} {error}
      </Callout>
  }
  if (!checked) return null

  const { config, models } = checked
  // The backend only accepts a memory model that is one of the models.
  const chosen = models.find((m) => m.id === modelId)
  const changed = generate !== config.memory.generate || use !== config.memory.use || (generate && !!chosen && chosen.id !== config.memory.model)
  const needsModel = generate && !chosen
  // The file and the running backend disagree, e.g. after a hand edit.
  const stale = status && (status.generationEnabled !== config.memory.generate || status.useEnabled !== config.memory.use)

  const save = async () => {
    setSaving(true)
    const applied = await applyConfig([
      { kind: 'set', path: ['memory', 'generate'], value: generate },
      { kind: 'set', path: ['memory', 'use'], value: use },
      ...(generate && chosen ? [{ kind: 'set' as const, path: ['memory', 'model'], value: chosen.id }] : []),
    ])
    if (applied) load(applied)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line px-4 py-4">
      <Row
        title={m.memory.settings.learn}
        hint={m.memory.settings.learnHint}
        control={<Switch label={m.memory.settings.learn} checked={generate} onChange={setGenerate} />}
      />
      {generate && (
        <div className="pl-0.5">
          <Field label={m.memory.settings.model} hint={needsModel ? m.memory.settings.modelNeeded : undefined}>
            <Select className="max-w-72" value={chosen?.id ?? ''} onChange={(e) => setModelId(e.target.value)}>
              {!chosen && <option value="">{m.memory.settings.chooseModel}</option>}
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
        control={<Switch label={m.memory.settings.use} checked={use} onChange={setUse} />}
      />
      {(changed || stale) && (
        <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
          <span className="text-small text-fg-subtle">
            {changed ? m.memory.settings.restarts : m.memory.settings.stale}
          </span>
          {changed ? (
            <Button size="sm" variant="primary" disabled={needsModel} loading={saving} onClick={() => void save()}>
              {m.memory.settings.saveAndRestart}
            </Button>
          ) : (
            <Button size="sm" icon={<RotateCw size={14} />} onClick={() => void desktop.backend.restart()}>
              {m.common.restartBackend}
            </Button>
          )}
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
