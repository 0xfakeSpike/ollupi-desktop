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
import { desktop } from '../../platform/desktop'

type Editing = { kind: 'provider'; index?: number } | { kind: 'model'; provider: number; index?: number }

const RENAMED = 'Threads whose last turn used the old id need another model chosen for their next turn.'

export function ModelsSection() {
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  const running = useModels((s) => s.list)
  const connected = useConnection((s) => s.gateway === 'connected')

  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? setChecked(r) : setError(r?.error)))
  }, [])

  if (error) return <Callout tone="danger">config.yaml cannot be read: {error}</Callout>
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
            <span className="flex-1">config.yaml lists different models than the backend is using.</span>
            <Button size="sm" icon={<RotateCw size={13} />} onClick={() => void desktop.backend.restart()}>
              Restart backend
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
            if (reason) return notify(reason, 'info')
            if (confirm(`Remove ${p.provider} and its models? ${RENAMED}`)) void apply(removeProvider(config, i))
          }}
          onAddModel={() => setEditing({ kind: 'model', provider: i })}
          onEditModel={(m) => setEditing({ kind: 'model', provider: i, index: m })}
          onRemoveModel={(m) => {
            const reason = cannotRemove(config, i, m)
            if (reason) return notify(reason, 'info')
            if (confirm(`Remove ${modelId(p.provider, p.names![m]!.name)}? ${RENAMED}`)) void apply(removeModel(config, i, m))
          }}
          onMakeDefault={(m) => void apply(makeDefault(i, m))}
        />
      ))}
      <div>
        <Button icon={<Plus size={14} />} onClick={() => setEditing({ kind: 'provider' })}>
          Add provider
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
  return (
    <div className="flex flex-col rounded-xl border border-line">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{p.provider}</div>
          <div className="selectable mt-0.5 truncate font-mono text-xs text-fg-subtle">{p.base_url || 'No base URL'}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
            <KeyRound size={12} />
            {keyFrom === 'api_key_env' ? (
              <span>
                Key from <code className="selectable font-mono">${p.api_key_env}</code>
              </span>
            ) : keyFrom === 'api_key' ? (
              <span>Key written in config.yaml</span>
            ) : (
              <span>No API key</span>
            )}
          </div>
        </div>
        <IconButton label={`Edit ${p.provider}`} size="sm" onClick={onEdit}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label={`Remove ${p.provider}`} size="sm" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {(p.names ?? []).map((m, i) => {
          const id = modelId(p.provider, m.name)
          const isDefault = isFirst && i === 0
          return (
            <li key={`${i}:${m.name}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="selectable font-mono text-xs text-fg">{m.name}</span>
                  {isDefault && <Badge tone="accent">default</Badge>}
                  {memoryModel === id && <Badge>memory</Badge>}
                </div>
                <ModelDetails model={m} />
              </div>
              {!isDefault && (
                <IconButton label={`Make ${id} the default`} size="sm" onClick={() => onMakeDefault(i)}>
                  <Star size={13} />
                </IconButton>
              )}
              <IconButton label={`Edit ${id}`} size="sm" onClick={() => onEditModel(i)}>
                <Pencil size={13} />
              </IconButton>
              <IconButton label={`Remove ${id}`} size="sm" onClick={() => onRemoveModel(i)}>
                <Trash2 size={13} />
              </IconButton>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line px-2 py-1.5">
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={onAddModel}>
          Add model
        </Button>
      </div>
    </div>
  )
}

function ModelDetails({ model: m }: { model: ProviderModel }) {
  const parts = [
    m.calls ? `${m.calls} concurrent calls` : undefined,
    m.thinking === true ? 'thinking on' : m.thinking === false ? 'thinking off' : undefined,
    m.limits ? `context ${m.limits.context.toLocaleString()} · output ${m.limits.output.toLocaleString()}` : undefined,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <div className="mt-0.5 text-xs text-fg-subtle">{parts.join(' · ')}</div>
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
  const [name, setName] = useState(provider?.provider ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '')
  const [keyEnv, setKeyEnv] = useState(provider?.api_key_env ?? '')
  const first = useModelForm(name.trim() || 'provider', undefined, [])
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameError = !trimmed
    ? 'Required.'
    : trimmed.includes('/')
      ? 'A model is selected as provider/name, so the name cannot contain /.'
      : taken.includes(trimmed)
        ? 'Another provider has this name.'
        : undefined
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
      title={provider ? `Edit ${provider.provider}` : 'Add provider'}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            Save and restart
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          hint={nameError && trimmed ? nameError : renamed ? `Its models' ids become ${trimmed}/… ${RENAMED}` : 'Models are selected as name/model.'}
        >
          <Input value={name} autoFocus spellCheck={false} placeholder="deepseek" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Base URL" hint="An OpenAI-compatible API.">
          <Input
            value={baseUrl}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder="https://api.deepseek.com"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
        <Field
          label="API key environment variable"
          hint={
            keyFrom === 'api_key' && keyEnv.trim()
              ? 'The key written in config.yaml is removed, so the variable is used.'
              : keyFrom === 'api_key'
                ? 'This provider’s key is written in config.yaml. Name a variable to use instead.'
                : 'Export it in ~/.zshrc first; the backend checks that it is set. Leave empty for an API without a key.'
          }
        >
          <Input
            value={keyEnv}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder="DEEPSEEK_API_KEY"
            onChange={(e) => setKeyEnv(e.target.value)}
          />
        </Field>
        {!provider && (
          <>
            <div className="border-t border-line pt-3 text-xs font-medium text-fg">First model</div>
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
  const [name, setName] = useState(model?.name ?? '')
  const [calls, setCalls] = useState(model?.calls ? String(model.calls) : '')
  const [thinking, setThinking] = useState(model?.thinking == null ? DEFAULT : String(model.thinking))
  const [context, setContext] = useState(model?.limits ? String(model.limits.context) : '')
  const [output, setOutput] = useState(model?.limits ? String(model.limits.output) : '')

  const trimmed = name.trim()
  const nameError = !trimmed ? 'Required.' : taken.includes(trimmed) ? `${provider} already has a model with this name.` : undefined
  const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : undefined)
  const callsError = calls.trim() && !count(calls) ? 'A positive whole number.' : undefined
  // ollupi needs both to fit a conversation in the model's window.
  const limitsError =
    (context.trim() || output.trim()) && (!count(context) || !count(output)) ? 'Give both as positive whole numbers, or neither.' : undefined
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
        label="Model name"
        hint={
          nameError && trimmed
            ? nameError
            : renamed
              ? `Its id becomes ${modelId(provider, trimmed)}. ${RENAMED}`
              : 'The name the API knows it by.'
        }
      >
        <Input value={name} spellCheck={false} className="font-mono text-xs" placeholder="deepseek-flash" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Concurrent calls" hint={callsError ?? 'How many requests to this model may run at once. Empty uses ollupi\u2019s default.'}>
        <Input value={calls} inputMode="numeric" className="max-w-32" placeholder="Default" onChange={(e) => setCalls(e.target.value)} />
      </Field>
      <Field label="Thinking" hint="Sent to the API as enable_thinking, which some APIs read to turn reasoning on or off.">
        <Select className="max-w-48" value={thinking} onChange={(e) => setThinking(e.target.value)}>
          <option value={DEFAULT}>Not sent (API default)</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </Select>
      </Field>
      <Field label="Token limits" hint={limitsError ?? 'Required for a model ollupi does not know; empty uses what ollupi knows.'}>
        <div className="flex gap-2">
          <Input value={context} inputMode="numeric" placeholder="Context" onChange={(e) => setContext(e.target.value)} />
          <Input value={output} inputMode="numeric" placeholder="Output" onChange={(e) => setOutput(e.target.value)} />
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
  const { form, fields, invalid } = useModelForm(provider, model, taken)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    await onSave(fields)
    setSaving(false)
  }
  return (
    <Dialog
      title={model ? `Edit ${modelId(provider, model.name)}` : `Add a model to ${provider}`}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={invalid} loading={saving} onClick={() => void save()}>
            Save and restart
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{form}</div>
    </Dialog>
  )
}
