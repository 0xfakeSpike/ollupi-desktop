// Edits one layer of permission.Settings (a workspace's or a thread's).
// Layers resolve by permission.Resolve: the most specific approval policy
// wins and allow/ask/deny rules accumulate, so a layer adds rules but never
// lifts a deny above it. An unset policy inherits: the field is left out.

import type { ApprovalPolicy, PermissionSettings } from '@ollupi/protocol'
import { Button, Field, Select, Textarea } from '@ollupi/ui'
import { useState } from 'react'

const policies: { value: ApprovalPolicy; label: string }[] = [
  { value: 'untrusted', label: 'Untrusted: ask before anything not known to be safe' },
  { value: 'on-request', label: 'On request: ask when a rule or the sandbox requires it' },
  { value: 'never', label: 'Never ask' },
]

const INHERIT = ''

type RuleKind = 'allow' | 'ask' | 'deny'

const kinds: { kind: RuleKind; label: string; hint: string }[] = [
  { kind: 'allow', label: 'Allow rules', hint: 'Run without asking.' },
  { kind: 'ask', label: 'Ask rules', hint: 'Always ask first.' },
  { kind: 'deny', label: 'Deny rules', hint: 'Never run; wins over allow and ask.' },
]

export function PermissionEditor({
  value,
  inheritFrom,
  onSave,
}: {
  value: PermissionSettings
  inheritFrom: string
  onSave(settings: PermissionSettings): Promise<boolean>
}) {
  const [policy, setPolicy] = useState<ApprovalPolicy | typeof INHERIT>(value.approvalPolicy ?? INHERIT)
  const [rules, setRules] = useState<Record<RuleKind, string>>({
    allow: (value.permissions.allow ?? []).join('\n'),
    ask: (value.permissions.ask ?? []).join('\n'),
    deny: (value.permissions.deny ?? []).join('\n'),
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
    await onSave({
      ...(policy === INHERIT ? {} : { approvalPolicy: policy }),
      permissions: { allow: lines(rules.allow), ask: lines(rules.ask), deny: lines(rules.deny) },
    })
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Approval policy" hint={policy === INHERIT ? `Uses the policy from ${inheritFrom}.` : undefined}>
        <Select value={policy} onChange={(e) => setPolicy(e.target.value as ApprovalPolicy | typeof INHERIT)}>
          <option value={INHERIT}>Inherit</option>
          {policies.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      {kinds.map(({ kind, label, hint }) => (
        <Field key={kind} label={label} hint={hint}>
          <Textarea
            rows={3}
            spellCheck={false}
            className="font-mono text-xs"
            value={rules[kind]}
            onChange={(e) => setRules({ ...rules, [kind]: e.target.value })}
            placeholder={'One rule per line: a tool name, or Tool(specifier)\ne.g. run_command(git:*)'}
          />
        </Field>
      ))}
      <div className="flex justify-end">
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save permissions
        </Button>
      </div>
    </div>
  )
}
