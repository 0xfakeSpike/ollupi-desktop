// Memory's two switches in config.yaml: learning (memory.generate, with the
// model that extracts memories) and recall (memory.use). They are read at the
// backend's start, so saving restarts it; the running backend reports what
// it actually uses in memory/status.

import type { MemoryStatus } from '@ollupi/protocol'
import { Button, Callout, Field, Select, Switch } from '@ollupi/ui'
import { RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { applyConfig, readConfig, type BackendConfig } from '../../domains/backendConfig'
import { desktop } from '../../platform/desktop'

type Model = NonNullable<BackendConfig['models']>[number]

/** The config's memory model as one of its chat models, if it is one. */
function sameModel(a: Model | null | undefined, b: Model): boolean {
  return !!a && a.name === b.name && a.endpoint === b.endpoint
}

export function MemorySettings({ status }: { status: MemoryStatus | undefined }) {
  const [config, setConfig] = useState<BackendConfig>()
  const [error, setError] = useState<string>()
  const [generate, setGenerate] = useState(false)
  const [use, setUse] = useState(false)
  const [modelId, setModelId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = (c: BackendConfig) => {
    setConfig(c)
    setGenerate(c.memory.generate)
    setUse(c.memory.use)
    setModelId((c.models ?? []).find((m) => sameModel(c.memory.model, m))?.id ?? '')
  }
  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? load(r.config) : setError(r?.error)))
  }, [])

  if (error) {
    return <Callout tone="danger">config.yaml cannot be read: {error}</Callout>
  }
  if (!config) return null

  const models = config.models ?? []
  const current = config.memory.model
  // A memory model set by hand that is not one of the chat models.
  const custom = current && !models.some((m) => sameModel(current, m)) ? current : undefined
  const chosen = models.find((m) => m.id === modelId)
  const changed = generate !== config.memory.generate || use !== config.memory.use || (generate && !!chosen && !sameModel(current, chosen))
  const needsModel = generate && !chosen && !custom
  // The file and the running backend disagree, e.g. after a hand edit.
  const stale = status && (status.generationEnabled !== config.memory.generate || status.useEnabled !== config.memory.use)

  const save = async () => {
    setSaving(true)
    const applied = await applyConfig([
      { kind: 'set', path: ['memory', 'generate'], value: generate },
      { kind: 'set', path: ['memory', 'use'], value: use },
      ...(generate && chosen ? [{ kind: 'set' as const, path: ['memory', 'model'], value: chosen }] : []),
    ])
    if (applied) load(applied)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line px-4 py-4">
      <Row
        title="Learn from conversations"
        hint="After each finished turn, a model distills what is worth remembering. This uses the model's tokens."
        control={<Switch label="Learn from conversations" checked={generate} onChange={setGenerate} />}
      />
      {generate && (
        <div className="pl-0.5">
          <Field label="Model that extracts memories" hint={needsModel ? 'Choose a model to turn learning on.' : undefined}>
            <Select className="max-w-72" value={chosen ? chosen.id : custom ? '__custom__' : ''} onChange={(e) => setModelId(e.target.value)}>
              {!chosen && !custom && <option value="">Choose a model</option>}
              {custom && <option value="__custom__">{`${custom.name} (${custom.endpoint}, from config.yaml)`}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === m.name ? m.name : `${m.id} · ${m.name}`}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <Row
        title="Use memories in conversations"
        hint="Recalled memories are added to the agent's context."
        control={<Switch label="Use memories in conversations" checked={use} onChange={setUse} />}
      />
      {(changed || stale) && (
        <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
          <span className="text-xs text-fg-subtle">
            {changed ? 'Saving restarts the backend, which reads these at start.' : 'config.yaml differs from what the backend is using.'}
          </span>
          {changed ? (
            <Button size="sm" variant="primary" disabled={needsModel} loading={saving} onClick={() => void save()}>
              Save and restart
            </Button>
          ) : (
            <Button size="sm" icon={<RotateCw size={13} />} onClick={() => void desktop.backend.restart()}>
              Restart backend
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
        <div className="text-[13px] font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-fg-muted">{hint}</div>
      </div>
      {control}
    </div>
  )
}
