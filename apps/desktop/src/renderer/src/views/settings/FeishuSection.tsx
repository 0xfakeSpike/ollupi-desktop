// The Feishu bot: the app's credentials, who it acts for, and the
// workspace sessions started from it belong to. Saving checks the change
// with the backend and restarts it, which connects the bot.

import { Button, Callout, Field, IconButton, Input, Select, Textarea } from '@ollupi/ui'
import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { applyConfig, readConfig, type CheckedConfig } from '../../domains/backendConfig'
import { feishuDomains, feishuFields, removeFeishu, saveFeishu, type FeishuDomain, type FeishuFields } from '../../domains/feishuConfig'
import { activeWorkspaces, useWorkspaces } from '../../domains/workspaces'
import { useT } from '../../i18n'

export function FeishuSection() {
  const m = useT()
  const t = m.settings.feishu
  const [checked, setChecked] = useState<CheckedConfig>()
  const [error, setError] = useState<string>()
  const [fields, setFields] = useState<FeishuFields>(feishuFields(undefined))
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const workspaces = activeWorkspaces(useWorkspaces((s) => s.list))

  const load = (c: CheckedConfig) => {
    setChecked(c)
    setFields(feishuFields(c.config.feishu))
  }
  useEffect(() => {
    void readConfig().then((r) => (r?.ok ? load(r) : setError(r?.error)))
  }, [])

  if (error) return <Callout tone="danger">{m.settings.config.unreadable(error)}</Callout>
  if (!checked) return null

  const configured = !!checked.config.feishu
  const saved = feishuFields(checked.config.feishu)
  const changed = (Object.keys(fields) as (keyof FeishuFields)[]).some((k) => fields[k] !== saved[k])
  const complete = fields.appId.trim() !== '' && fields.appSecret.trim() !== ''
  const set = (patch: Partial<FeishuFields>) => setFields((f) => ({ ...f, ...patch }))
  const apply = async (changes: Parameters<typeof applyConfig>[0]) => {
    setSaving(true)
    const applied = await applyConfig(changes).finally(() => setSaving(false))
    if (applied) load(applied)
  }
  // A folder the file names that is not an open workspace still shows, so
  // saving does not change it unseen.
  const folders = workspaces.map((w) => ({ path: w.rootPath, name: w.name }))
  if (fields.workspace && !folders.some((f) => f.path === fields.workspace)) folders.push({ path: fields.workspace, name: fields.workspace })

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface px-5 py-4">
      <Field label={t.appId}>
        <Input value={fields.appId} spellCheck={false} className="font-mono text-small" placeholder="cli_xxx" onChange={(e) => set({ appId: e.target.value })} />
      </Field>
      <Field label={t.appSecret}>
        <div className="flex items-center gap-2">
          <Input
            value={fields.appSecret}
            type={showSecret ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-small"
            onChange={(e) => set({ appSecret: e.target.value })}
          />
          <IconButton label={showSecret ? t.hideSecret : t.showSecret} size="sm" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
        </div>
      </Field>
      <Field label={t.domain}>
        <Select className="max-w-60" value={fields.domain} onChange={(e) => set({ domain: e.target.value as FeishuDomain })}>
          {feishuDomains.map((d) => (
            <option key={d} value={d}>
              {t.domains[d]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.users} hint={t.usersHint}>
        <Textarea
          rows={3}
          value={fields.users}
          spellCheck={false}
          className="font-mono text-small"
          placeholder="ou_xxx"
          onChange={(e) => set({ users: e.target.value })}
        />
      </Field>
      <Field label={t.workspace} hint={t.workspaceHint}>
        <Select className="max-w-80" value={fields.workspace} onChange={(e) => set({ workspace: e.target.value })}>
          <option value="">{t.noWorkspace}</option>
          {folders.map((f) => (
            <option key={f.path} value={f.path}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" loading={saving} disabled={!complete || !changed} onClick={() => void apply(saveFeishu(fields))}>
          {m.settings.config.saveAndRestart}
        </Button>
        {configured && (
          <Button disabled={saving} onClick={() => confirm(t.confirmRemove) && void apply(removeFeishu())}>
            {t.remove}
          </Button>
        )}
      </div>
    </div>
  )
}
