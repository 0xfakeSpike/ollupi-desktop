// Edits one layer of permission.Settings (a workspace's or a thread's).
// Layers resolve by permission.Resolve: the most specific approval policy
// wins and allow/ask/deny rules accumulate, so a layer adds rules but never
// lifts a deny above it. An unset policy inherits: the field is left out.

import type { ApprovalPolicy, PermissionSettings } from '@ollupi/protocol'
import { Button, Field, Select, Textarea } from '@ollupi/ui'
import { useState } from 'react'
import { useT, type Messages } from '../../i18n'

const policies = (m: Messages): { value: ApprovalPolicy; label: string }[] => [
  { value: 'untrusted', label: m.settings.permissions.policies.untrusted },
  { value: 'on-request', label: m.settings.permissions.policies.onRequest },
  { value: 'never', label: m.settings.permissions.policies.never },
]

const INHERIT = ''

type RuleKind = 'allow' | 'ask' | 'deny'

const kinds: RuleKind[] = ['allow', 'ask', 'deny']

export function PermissionEditor({
  value,
  inheritFrom,
  onSave,
}: {
  value: PermissionSettings
  inheritFrom: string
  onSave(settings: PermissionSettings): Promise<boolean>
}) {
  const m = useT()
  const [policy, setPolicy] = useState<ApprovalPolicy | typeof INHERIT>(value.approvalPolicy ?? INHERIT)
  const [rules, setRules] = useState<Record<RuleKind, string>>({
    allow: (value.permissions.allow ?? []).join('\n'),
    ask: (value.permissions.ask ?? []).join('\n'),
    deny: (value.permissions.deny ?? []).join('\n'),
  })
  const [saving, setSaving] = useState(false)

  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
  const next: PermissionSettings = {
    ...(policy === INHERIT ? {} : { approvalPolicy: policy }),
    permissions: { allow: lines(rules.allow), ask: lines(rules.ask), deny: lines(rules.deny) },
  }
  // Saved settings come back as value, so the button rests until the next edit.
  const unchanged =
    (next.approvalPolicy ?? INHERIT) === (value.approvalPolicy ?? INHERIT) &&
    kinds.every((k) => (next.permissions[k] ?? []).join('\n') === (value.permissions[k] ?? []).join('\n'))

  const save = async () => {
    setSaving(true)
    await onSave(next)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={m.settings.permissions.policy} hint={policy === INHERIT ? m.settings.permissions.inheritHint(inheritFrom) : undefined}>
        <Select value={policy} onChange={(e) => setPolicy(e.target.value as ApprovalPolicy | typeof INHERIT)}>
          <option value={INHERIT}>{m.settings.permissions.inherit}</option>
          {policies(m).map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      {kinds.map((kind) => (
        <Field key={kind} label={m.settings.permissions.kinds[kind].label} hint={m.settings.permissions.kinds[kind].hint}>
          <Textarea
            rows={3}
            spellCheck={false}
            className="font-mono text-small"
            value={rules[kind]}
            onChange={(e) => setRules({ ...rules, [kind]: e.target.value })}
            placeholder={m.settings.permissions.rulesPlaceholder}
          />
        </Field>
      ))}
      <div className="flex justify-end">
        <Button variant="primary" disabled={unchanged} loading={saving} onClick={() => void save()}>
          {m.settings.permissions.save}
        </Button>
      </div>
    </div>
  )
}
