// Edits one layer of ollupi's permission settings (workspace or thread).
// Layers stack: the most specific approval policy wins, while allow/ask/deny
// rules accumulate, so a layer can add rules but never lift a deny above it.

import type { ApprovalPolicy, PermissionSettings } from '@ollupi/protocol'
import { Button, Field, Select } from '@ollupi/ui'
import { useState } from 'react'

const policies: { value: ApprovalPolicy | ''; label: string }[] = [
  { value: '', label: 'Inherit' },
  { value: 'untrusted', label: 'Untrusted: ask before anything not known safe' },
  { value: 'on-request', label: 'On request: ask when a rule or the sandbox requires it' },
  { value: 'never', label: 'Never ask' },
]

type RuleKind = 'allow' | 'ask' | 'deny'

const ruleHints: Record<RuleKind, string> = {
  allow: 'Run without asking.',
  ask: 'Always ask first.',
  deny: 'Never run; overrides allow and ask.',
}

export function PermissionEditor({
  value,
  onSave,
  inheritFrom,
}: {
  value: PermissionSettings
  onSave(settings: PermissionSettings): Promise<boolean>
  inheritFrom: string
}) {
  const [policy, setPolicy] = useState(value.approvalPolicy ?? '')
  const [rules, setRules] = useState<Record<RuleKind, string>>({
    allow: (value.permissions?.allow ?? []).join('\n'),
    ask: (value.permissions?.ask ?? []).join('\n'),
    deny: (value.permissions?.deny ?? []).join('\n'),
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
    await onSave({
      approvalPolicy: policy,
      permissions: { allow: lines(rules.allow), ask: lines(rules.ask), deny: lines(rules.deny) },
    })
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Approval policy" hint={policy === '' ? `Uses the policy from ${inheritFrom}.` : undefined}>
        <Select value={policy} onChange={(e) => setPolicy(e.target.value as ApprovalPolicy | '')}>
          {policies.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      {(['allow', 'ask', 'deny'] as const).map((kind) => (
        <Field key={kind} label={`${kind[0]!.toUpperCase()}${kind.slice(1)} rules`} hint={ruleHints[kind]}>
          <textarea
            value={rules[kind]}
            onChange={(e) => setRules({ ...rules, [kind]: e.target.value })}
            rows={3}
            spellCheck={false}
            placeholder={'One rule per line: a tool name, or Tool(specifier)\ne.g. run_command(git:*)'}
            className="w-full rounded-md border border-line-strong bg-raised px-2.5 py-2 font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
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
