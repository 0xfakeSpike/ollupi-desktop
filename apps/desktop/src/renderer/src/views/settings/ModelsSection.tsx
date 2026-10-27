// config.yaml's models: the providers (OpenAI-compatible APIs) and the
// models each serves. ollupi reads them at start, so every saved change is
// checked by the backend, written, and the backend restarted. Keys stay in
// the user's environment; a provider names the variable that holds its key.

import { Badge, Button, Callout, Dialog, Field, IconButton, Input, Select } from '@ollupi/ui'
import { KeyRound, Pencil, Plus, RotateCw, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConfigChange } from '../../../../shared/ipc'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import {
  addModel,
  addProvider,
  cannotRemove,
  cannotRemoveProvider,
  editModel,
  editProvider,
  makeDefault,
  modelId,
  removeModel,
  removeProvider,
  type ModelFields,
  type Provider,
  type ProviderFields,
  type ProviderModel,
} from '../../domains/modelConfig'
import { useModels } from '../../domains/models'
import { notify } from '../../domains/notices'
import { useConnection } from '../../gateway/connection'
import { useLocale, useT } from '../../i18n'
import { desktop } from '../../platform/desktop'

type Editing = { kind: 'provider'; index?: number } | { kind: 'model'; provider: number; index?: number }

export function ModelsSection() {
  const m = useT()
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  const running = useModels((s) => s.list)
  const connected = useConnection((s) => s.gateway === 'connected')

  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? setChecked(r) : setError(r?.error)))
  }, [])

  if (error) return <Callout tone="danger">{m.settings.config.unreadable(error)}</Callout>
  if (!checked) return null

  const { config, models, keys } = checked
  const providers = config.models ?? []
  /** Applies changes; true when the backend accepted them. */
  const apply = async (changes: ConfigChange[]): Promise<boolean> => {
    const applied = await applyConfig(changes)
    if (applied) setChecked(applied)
    return !!applied
  }
  // The file and the running backend disagree, e.g. after a hand edit. The
  // order matters: the first model is the default.
  const stale = connected && running.map((m) => m.connection).join('\n') !== models.map((m) => m.id).join('\n')

  return (
    <>
      {stale && (
        <Callout tone="warning">
          <div className="flex items-center gap-3">
            <span className="flex-1">{m.settings.models.stale}</span>
            <Button size="sm" icon={<RotateCw size={14} />} onClick={() => void desktop.backend.restart()}>
              {m.common.restartBackend}
            </Button>
          </div>
        </Callout>
      )}
      {providers.map((p, i) => (
        <ProviderCard
          key={`${i}:${p.provider}`}
          provider={p}
          keyFrom={keys[i]?.from}
          isFirst={i === 0}
          memoryModel={config.memory.generate ? config.memory.model : undefined}
          onEdit={() => setEditing({ kind: 'provider', index: i })}
          onRemove={() => {
            const reason = cannotRemoveProvider(config, i)
            if (reason) return notify(m.errors.modelRemoval[reason], 'info')
            if (confirm(m.settings.models.confirmRemoveProvider(p.provider, m.settings.models.renamed))) void apply(removeProvider(config, i))
          }}
          onAddModel={() => setEditing({ kind: 'model', provider: i })}
          onEditModel={(j) => setEditing({ kind: 'model', provider: i, index: j })}
          onRemoveModel={(j) => {
            const reason = cannotRemove(config, i, j)
            if (reason) return notify(m.errors.modelRemoval[reason], 'info')
            if (confirm(m.settings.models.confirmRemoveModel(modelId(p.provider, p.names![j]!.name), m.settings.models.renamed)))
              void apply(removeModel(config, i, j))
          }}
          onMakeDefault={(j) => void apply(makeDefault(i, j))}
        />
      ))}
      <div>
        <Button icon={<Plus size={14} />} onClick={() => setEditing({ kind: 'provider' })}>
          {m.settings.models.addProvider}
        </Button>
      </div>
      {editing?.kind === 'provider' && (
        <ProviderDialog
          provider={editing.index === undefined ? undefined : providers[editing.index]}
          keyFrom={editing.index === undefined ? undefined : keys[editing.index]?.from}
          taken={providers.filter((_, i) => i !== editing.index).map((p) => p.provider)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields, first) => {
            const changes = editing.index === undefined ? addProvider(config, fields, first!) : editProvider(config, editing.index, fields)
            if (await apply(changes)) setEditing(undefined)
          }}
        />
      )}
      {editing?.kind === 'model' && (
        <ModelDialog
          provider={providers[editing.provider]!.provider}
          model={editing.index === undefined ? undefined : providers[editing.provider]!.names![editing.index]}
          taken={(providers[editing.provider]!.names ?? []).filter((_, i) => i !== editing.index).map((m) => m.name)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields) => {
            const changes =
              editing.index === undefined ? addModel(config, editing.provider, fields) : editModel(config, editing.provider, editing.index, fields)
            if (await apply(changes)) setEditing(undefined)
          }}
        />
      )}
    </>
  )
}

function ProviderCard({
  provider: p,
  keyFrom,
  isFirst,
  memoryModel,
  onEdit,
  onRemove,
  onAddModel,
  onEditModel,
  onRemoveModel,
  onMakeDefault,
}: {
  provider: Provider
  keyFrom: string | undefined
  isFirst: boolean
  /** The model learning extracts memories with, if learning is on. */
  memoryModel: string | undefined
  onEdit(): void
  onRemove(): void
  onAddModel(): void
  onEditModel(index: number): void
  onRemoveModel(index: number): void
  onMakeDefault(index: number): void
}) {
  const m = useT()
  const c = m.settings.models.card
  return (
    <div className="flex flex-col rounded-lg border border-line">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-ui font-medium text-fg">{p.provider}</div>
          <div className="selectable mt-0.5 truncate font-mono text-small text-fg-subtle">{p.base_url || c.noBaseUrl}</div>
          <div className="mt-1 flex items-center gap-1.5 text-small text-fg-muted">
            <KeyRound size={14} />
            {keyFrom === 'api_key_env' ? (
              <span>{c.keyFrom(<code className="selectable font-mono">${p.api_key_env}</code>)}</span>
            ) : keyFrom === 'api_key' ? (
              <span>{c.keyWritten}</span>
            ) : (
              <span>{c.noKey}</span>
            )}
          </div>
        </div>
        <IconButton label={c.edit(p.provider)} size="sm" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label={c.remove(p.provider)} size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {(p.names ?? []).map((model, i) => {
          const id = modelId(p.provider, model.name)
          const isDefault = isFirst && i === 0
          return (
            <li key={`${i}:${model.name}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="selectable font-mono text-small text-fg">{model.name}</span>
                  {isDefault && <Badge tone="accent">{c.default}</Badge>}
                  {memoryModel === id && <Badge>{c.memory}</Badge>}
                </div>
                <ModelDetails model={model} />
              </div>
              {!isDefault && (
                <IconButton label={c.makeDefault(id)} size="sm" onClick={() => onMakeDefault(i)}>
                  <Star size={14} />
                </IconButton>
              )}
              <IconButton label={c.edit(id)} size="sm" onClick={() => onEditModel(i)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton label={c.remove(id)} size="sm" onClick={() => onRemoveModel(i)}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line px-2 py-1.5">
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={onAddModel}>
          {m.settings.models.addModel}
        </Button>
      </div>
    </div>
  )
}

function ModelDetails({ model }: { model: ProviderModel }) {
  const d = useT().settings.models.details
  const locale = useLocale((s) => s.locale)
  const parts = [
    model.calls ? d.calls(model.calls) : undefined,
    model.thinking === true ? d.thinkingOn : model.thinking === false ? d.thinkingOff : undefined,
    model.limits ? d.limits(model.limits.context.toLocaleString(locale), model.limits.output.toLocaleString(locale)) : undefined,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <div className="mt-0.5 text-small text-fg-subtle">{parts.join(' · ')}</div>
}

function ProviderDialog({
  provider,
  keyFrom,
  taken,
  onClose,
  onSave,
}: {
  provider: Provider | undefined
  keyFrom: string | undefined
  /** The other providers' names; names are unique. */
  taken: string[]
  onClose(): void
  /** first is the new provider's first model; a provider serves at least one. */
  onSave(fields: ProviderFields, first: ModelFields | undefined): Promise<void>
}) {
  const m = useT()
  const t = m.settings.models.provider
  const [name, setName] = useState(provider?.provider ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '')
  const [keyEnv, setKeyEnv] = useState(provider?.api_key_env ?? '')
  const first = useModelForm(name.trim() || 'provider', undefined, [])
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameError = !trimmed ? t.required : trimmed.includes('/') ? t.noSlash : taken.includes(trimmed) ? t.taken : undefined
  const renamed = provider && trimmed !== provider.provider && (provider.names ?? []).length > 0
  const valid = !nameError && (provider || !first.invalid)

  const save = async () => {
    setSaving(true)
    await onSave(
      { provider: trimmed, baseUrl: baseUrl.trim(), keyEnv: keyEnv.trim() },
      provider ? undefined : first.fields,
    )
    setSaving(false)
  }

  return (
    <Dialog
      title={provider ? t.editTitle(provider.provider) : t.addTitle}
      closeLabel={m.common.close}
      onClose={onClose}
      footer={
        <>
          <Button size="lg" onClick={onClose}>{m.common.cancel}</Button>
          <Button size="lg" variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            {m.settings.config.saveAndRestart}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t.name}
          error={trimmed && nameError}
        hint={renamed ? t.renamedIds(trimmed, m.settings.models.renamed) : t.nameHint}
        >
          <Input value={name} autoFocus spellCheck={false} placeholder="deepseek" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.baseUrl} hint={t.baseUrlHint}>
          <Input
            value={baseUrl}
            spellCheck={false}
            className="font-mono text-small"
            placeholder="https://api.deepseek.com"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
        <Field
          label={t.keyEnv}
          hint={keyFrom === 'api_key' && keyEnv.trim() ? t.keyEnvReplaces : keyFrom === 'api_key' ? t.keyEnvWritten : t.keyEnvHint}
        >
          <Input
            value={keyEnv}
            spellCheck={false}
            className="font-mono text-small"
            placeholder="DEEPSEEK_API_KEY"
            onChange={(e) => setKeyEnv(e.target.value)}
          />
        </Field>
        {!provider && (
          <>
            <div className="border-t border-line pt-3 text-small font-medium text-fg">{t.firstModel}</div>
            {first.form}
          </>
        )}
      </div>
    </Dialog>
  )
}

const DEFAULT = ''

/** The fields of one model, for a model dialog and a new provider's first
 * model: the form, its value, and whether it can be saved. */
function useModelForm(provider: string, model: ProviderModel | undefined, taken: string[]) {
  const m = useT()
  const t = m.settings.models.model
  const [name, setName] = useState(model?.name ?? '')
  const [calls, setCalls] = useState(model?.calls ? String(model.calls) : '')
  const [thinking, setThinking] = useState(model?.thinking == null ? DEFAULT : String(model.thinking))
  const [context, setContext] = useState(model?.limits ? String(model.limits.context) : '')
  const [output, setOutput] = useState(model?.limits ? String(model.limits.output) : '')

  const trimmed = name.trim()
  const nameError = !trimmed ? t.required : taken.includes(trimmed) ? t.taken(provider) : undefined
  const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : undefined)
  const callsError = calls.trim() && !count(calls) ? t.callsError : undefined
  // ollupi needs both to fit a conversation in the model's window.
  const limitsError =
    (context.trim() || output.trim()) && (!count(context) || !count(output)) ? t.limitsError : undefined
  const renamed = model && trimmed !== model.name

  const fields: ModelFields = {
    name: trimmed,
    calls: count(calls),
    thinking: thinking === DEFAULT ? undefined : thinking === 'true',
    limits: count(context) && count(output) ? { context: count(context)!, output: count(output)! } : undefined,
  }
  const form = (
    <>
      <Field
        label={t.name}
        error={trimmed && nameError}
        hint={renamed ? t.renamedId(modelId(provider, trimmed), m.settings.models.renamed) : t.nameHint}
      >
        <Input value={name} spellCheck={false} className="font-mono text-small" placeholder="deepseek-flash" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.calls} error={callsError} hint={t.callsHint}>
        <Input value={calls} inputMode="numeric" className="max-w-32" placeholder={t.callsPlaceholder} onChange={(e) => setCalls(e.target.value)} />
      </Field>
      <Field label={t.thinking} hint={t.thinkingHint}>
        <Select className="max-w-48" value={thinking} onChange={(e) => setThinking(e.target.value)}>
          <option value={DEFAULT}>{t.thinkingDefault}</option>
          <option value="true">{t.on}</option>
          <option value="false">{t.off}</option>
        </Select>
      </Field>
      <Field label={t.limits} error={limitsError} hint={t.limitsHint}>
        <div className="flex gap-2">
          <Input value={context} inputMode="numeric" placeholder={t.context} onChange={(e) => setContext(e.target.value)} />
          <Input value={output} inputMode="numeric" placeholder={t.output} onChange={(e) => setOutput(e.target.value)} />
        </div>
      </Field>
    </>
  )
  return { form, fields, invalid: !!(nameError || callsError || limitsError) }
}

function ModelDialog({
  provider,
  model,
  taken,
  onClose,
  onSave,
}: {
  provider: string
  model: ProviderModel | undefined
  /** The provider's other model names; names are unique per provider. */
  taken: string[]
  onClose(): void
  onSave(fields: ModelFields): Promise<void>
}) {
  const m = useT()
  const { form, fields, invalid } = useModelForm(provider, model, taken)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    await onSave(fields)
    setSaving(false)
  }
  return (
    <Dialog
      title={model ? m.settings.models.model.editTitle(modelId(provider, model.name)) : m.settings.models.model.addTitle(provider)}
      closeLabel={m.common.close}
      onClose={onClose}
      footer={
        <>
          <Button size="lg" onClick={onClose}>{m.common.cancel}</Button>
          <Button size="lg" variant="primary" disabled={invalid} loading={saving} onClick={() => void save()}>
            {m.settings.config.saveAndRestart}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{form}</div>
    </Dialog>
  )
}
