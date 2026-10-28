// config.yaml's models: the providers (OpenAI-compatible APIs) and the
// models each serves. ollupi reads them at start, so every saved change is
// checked by the backend, written, and the backend restarted. A provider's
// API key is written there too, like its base URL.

import { Badge, Button, Callout, Checkbox, Dialog, Field, IconButton, Input, Select, Spinner } from '@ollupi/ui'
import { Eye, EyeOff, KeyRound, Pencil, Plus, RotateCw, Star, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { ConfigChange, ListedModel } from '../../../../shared/ipc'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import {
  addModels,
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
import { useModelList, type ModelListState } from '../../domains/modelList'
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

  const { config, models } = checked
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
          taken={providers.filter((_, i) => i !== editing.index).map((p) => p.provider)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields, models) => {
            const changes =
              editing.index === undefined
                ? addProvider(config, fields, models)
                : [...editProvider(config, editing.index, fields), ...addModels(config, editing.index, models)]
            if (await apply(changes)) setEditing(undefined)
          }}
        />
      )}
      {editing?.kind === 'model' && (
        <ModelDialog
          provider={providers[editing.provider]!}
          model={editing.index === undefined ? undefined : providers[editing.provider]!.names![editing.index]}
          taken={(providers[editing.provider]!.names ?? []).filter((_, i) => i !== editing.index).map((m) => m.name)}
          onClose={() => setEditing(undefined)}
          onSave={async (fields) => {
            const changes =
              editing.index === undefined ? addModels(config, editing.provider, [fields]) : editModel(config, editing.provider, editing.index, fields)
            if (await apply(changes)) setEditing(undefined)
          }}
        />
      )}
    </>
  )
}

function ProviderCard({
  provider: p,
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
            <span>{p.api_key ? c.keySet : c.noKey}</span>
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
    d.limits(model.limits.context.toLocaleString(locale), model.limits.output.toLocaleString(locale)),
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <div className="mt-0.5 text-small text-fg-subtle">{parts.join(' · ')}</div>
}

function ProviderDialog({
  provider,
  taken,
  onClose,
  onSave,
}: {
  provider: Provider | undefined
  /** The other providers' names; names are unique. */
  taken: string[]
  onClose(): void
  /** The models to add: a new provider's, of which it serves at least one,
   * or more for an existing one. */
  onSave(fields: ProviderFields, models: ModelFields[]): Promise<void>
}) {
  const m = useT()
  const t = m.settings.models.provider
  const [name, setName] = useState(provider?.provider ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '')
  const [apiKey, setApiKey] = useState(provider?.api_key ?? '')
  const [showKey, setShowKey] = useState(false)
  const first = useModelForm(name.trim() || 'provider', undefined, [])
  const { list, retry } = useModelList(baseUrl, apiKey)
  // The checked models, each with its limits as typed.
  const [picked, setPicked] = useState<Picked>({})
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const nameError = !trimmed ? t.required : trimmed.includes('/') ? t.noSlash : taken.includes(trimmed) ? t.taken : undefined
  const renamed = provider && trimmed !== provider.provider && (provider.names ?? []).length > 0
  const served = (provider?.names ?? []).map((m) => m.name)
  // Listed models the provider does not serve yet, in the list's order.
  const offered = list.status === 'listed' ? list.models.filter((m) => !served.includes(m.name)) : []
  const chosen = offered.map((m) => m.name).filter((n) => picked[n])
  const chosenModels = chosen.flatMap((n): ModelFields[] => {
    const limits = limitsOf(picked[n]!.context, picked[n]!.output)
    return limits ? [{ name: n, calls: undefined, thinking: undefined, limits }] : []
  })
  // A new provider's models come from the list when the API gives one;
  // otherwise its first model is typed in.
  const fromList = !provider && offered.length > 0
  const listValid = chosenModels.length === chosen.length
  const valid = !nameError && listValid && (provider || (fromList ? chosen.length > 0 : !first.invalid))

  const save = async () => {
    setSaving(true)
    await onSave(
      { provider: trimmed, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() },
      fromList || provider ? chosenModels : [first.fields],
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
        <Field label={t.apiKey} hint={t.apiKeyHint}>
          <div className="flex items-center gap-2">
            <Input
              value={apiKey}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-small"
              placeholder="sk-..."
              onChange={(e) => setApiKey(e.target.value)}
            />
            <IconButton label={showKey ? t.hideKey : t.showKey} size="sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
          </div>
        </Field>
        {offered.length > 0 ? (
          <ModelPicker title={provider ? t.addModels : t.models} models={offered} picked={picked} onPick={setPicked} />
        ) : provider ? (
          list.status !== 'idle' && (
            <>
              <div className="border-t border-line pt-3 text-small font-medium text-fg">{t.addModels}</div>
              <ListStatus list={list} retry={retry} existing />
            </>
          )
        ) : (
          <>
            <div className="border-t border-line pt-3 text-small font-medium text-fg">{t.firstModel}</div>
            <ListStatus list={list} retry={retry} existing={false} />
            {first.form}
          </>
        )}
      </div>
    </Dialog>
  )
}

/** Why there is no list to choose from, while there is none. existing is
 * for a provider already saved, which needs no model typed in. */
function ListStatus({ list, retry, existing }: { list: ModelListState; retry(): void; existing: boolean }) {
  const t = useT().settings.models.provider
  if (list.status === 'idle') return null
  if (list.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-small text-fg-subtle">
        <Spinner size={14} />
        {t.listing}
      </div>
    )
  }
  if (list.status === 'listed') return <div className="text-small text-fg-subtle">{existing && list.models.length ? t.allAdded : t.noneListed}</div>
  return (
    <div className="flex items-start gap-3 text-small">
      <span className="selectable min-w-0 flex-1 text-fg-muted">
        {t.listFailed(list.error)} {!existing && t.byHand}
      </span>
      <Button size="sm" icon={<RotateCw size={14} />} onClick={retry}>
        {t.retry}
      </Button>
    </div>
  )
}

/** Checked models by name, with their limits as typed. */
type Picked = Record<string, { context: string; output: string }>

const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : undefined)

/** Limits as ollupi takes them: both positive, the answer within the window. */
function limitsOf(context: string, output: string): ModelFields['limits'] | undefined {
  const c = count(context)
  const o = count(output)
  return c && o && o < c ? { context: c, output: o } : undefined
}

/** Why typed limits are refused; nothing while neither is typed. */
const limitsProblem = (context: string, output: string, message: string) =>
  (context.trim() || output.trim()) && !limitsOf(context, output) ? message : undefined

/** The listed models to add, as checkboxes; long lists can be filtered. A
 * checked model takes its limits, filled in from the list when the API says
 * them. */
function ModelPicker({ title, models, picked, onPick }: { title: string; models: ListedModel[]; picked: Picked; onPick(picked: Picked): void }) {
  const names = models.map((m) => m.name)
  const m = useT().settings.models
  const t = m.provider
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const shown = query ? names.filter((n) => n.toLowerCase().includes(query)) : names
  const chosen = names.filter((n) => picked[n])
  const allShown = shown.length > 0 && shown.every((n) => picked[n])
  const check = (list: string[], on: boolean) => {
    const next = { ...picked }
    for (const n of list) {
      if (!on) delete next[n]
      else {
        const listed = models.find((m) => m.name === n)?.limits
        next[n] ??= { context: listed ? String(listed.context) : '', output: listed ? String(listed.output) : '' }
      }
    }
    onPick(next)
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <span className="text-small font-medium text-fg">{title}</span>
        <span className="flex-1 text-small text-fg-subtle">{t.selected(chosen.length, names.length)}</span>
        <Button size="sm" variant="ghost" disabled={shown.length === 0} onClick={() => check(shown, !allShown)}>
          {allShown ? t.clear : t.selectAll}
        </Button>
      </div>
      {names.length > 8 && <Input value={filter} spellCheck={false} placeholder={t.filter} onChange={(e) => setFilter(e.target.value)} />}
      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-line py-1">
        {shown.map((n) => {
          const limits = picked[n]
          const problem = limits && limitsProblem(limits.context, limits.output, m.model.limitsError)
          const set = (part: 'context' | 'output', value: string) => onPick({ ...picked, [n]: { ...limits!, [part]: value } })
          return (
            <li key={n} className="flex flex-col gap-1.5 px-3 py-1">
              <Checkbox checked={!!limits} onChange={(on) => check([n], on)}>
                <span className="selectable truncate font-mono text-small">{n}</span>
              </Checkbox>
              {limits && (
                <div className="flex flex-col gap-1 pb-1 pl-5.5">
                  <div className="flex gap-3">
                    {(['context', 'output'] as const).map((part) => (
                      <label key={part} className="flex flex-1 items-center gap-2 text-small text-fg-subtle">
                        <span className="shrink-0">{m.model[part]}</span>
                        <Input
                          value={limits[part]}
                          inputMode="numeric"
                          aria-label={`${n} ${m.model[part]}`}
                          onChange={(e) => set(part, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  {problem && <span className="text-small text-danger">{problem}</span>}
                </div>
              )}
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-1 text-small text-fg-subtle">{t.noMatch}</li>}
      </ul>
      <span className="text-small text-fg-subtle">{t.pickedHint}</span>
    </div>
  )
}

const DEFAULT = ''

/** The fields of one model, for a model dialog and a new provider's first
 * model: the form, its value, and whether it can be saved. */
function useModelForm(provider: string, model: ProviderModel | undefined, taken: string[], suggested: string[] = []) {
  const m = useT()
  const t = m.settings.models.model
  const [name, setName] = useState(model?.name ?? '')
  const [calls, setCalls] = useState(model?.calls ? String(model.calls) : '')
  const [thinking, setThinking] = useState(model?.thinking == null ? DEFAULT : String(model.thinking))
  const [context, setContext] = useState(model ? String(model.limits.context) : '')
  const [output, setOutput] = useState(model ? String(model.limits.output) : '')

  const trimmed = name.trim()
  const nameError = !trimmed ? t.required : taken.includes(trimmed) ? t.taken(provider) : undefined
  const callsError = calls.trim() && !count(calls) ? t.callsError : undefined
  // ollupi fits a conversation in the model's window with them.
  const limits = limitsOf(context, output)
  const limitsError = limitsProblem(context, output, t.limitsError)
  const renamed = model && trimmed !== model.name
  const suggestions = useId()

  const fields: ModelFields = {
    name: trimmed,
    calls: count(calls),
    thinking: thinking === DEFAULT ? undefined : thinking === 'true',
    limits: limits ?? { context: 0, output: 0 },
  }
  const form = (
    <>
      <Field
        label={t.name}
        error={trimmed && nameError}
        hint={renamed ? t.renamedId(modelId(provider, trimmed), m.settings.models.renamed) : t.nameHint}
      >
        <Input
          value={name}
          spellCheck={false}
          className="font-mono text-small"
          placeholder="deepseek-flash"
          list={suggested.length ? suggestions : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {suggested.length > 0 && (
          <datalist id={suggestions}>
            {suggested.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
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
  return { form, fields, invalid: !!(nameError || callsError || !limits) }
}

function ModelDialog({
  provider: p,
  model,
  taken,
  onClose,
  onSave,
}: {
  provider: Provider
  model: ProviderModel | undefined
  /** The provider's other model names; names are unique per provider. */
  taken: string[]
  onClose(): void
  onSave(fields: ModelFields): Promise<void>
}) {
  const m = useT()
  // The name can be picked from what the API lists and the provider does not serve.
  const { list } = useModelList(p.base_url ?? '', p.api_key ?? '')
  const suggested = list.status === 'listed' ? list.models.map((m) => m.name).filter((n) => !taken.includes(n)) : []
  const provider = p.provider
  const { form, fields, invalid } = useModelForm(provider, model, taken, suggested)
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
