// Edits one layer of permission.Settings (a workspace's or a thread's).
// Layers resolve by permission.Resolve: the most specific approval policy
// wins and allow/ask/deny rules accumulate, so a layer adds rules but never
// lifts a deny above it. An unset policy inherits: the field is left out.

import type { ApprovalPolicy, PermissionSettings } from '@ollupi/protocol'
import { Button, cn, Field, Select, Textarea } from '@ollupi/ui'
import { ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { useT, type Messages } from '../../i18n'

/** Strictest first, so the order itself reads as how much is asked. */
const policies = (m: Messages): { value: ApprovalPolicy; label: string; hint: string }[] => [
  { value: 'untrusted', ...m.settings.permissions.policies.untrusted },
  { value: 'on-request', ...m.settings.permissions.policies.onRequest },
  { value: 'never', ...m.settings.permissions.policies.never },
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
  const count = kinds.reduce((n, k) => n + (value.permissions[k]?.length ?? 0), 0)
  // The policy is enough for most people; rules already written stay in view.
  const [exceptions, setExceptions] = useState(count > 0)
  const exceptionsId = useId()

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
      <Field
        label={m.settings.permissions.policy}
        hint={policy === INHERIT ? m.settings.permissions.inheritHint(inheritFrom) : policies(m).find((p) => p.value === policy)?.hint}
      >
        <Select value={policy} onChange={(e) => setPolicy(e.target.value as ApprovalPolicy | typeof INHERIT)}>
          <option value={INHERIT}>{m.settings.permissions.inherit}</option>
          {policies(m).map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <button
          type="button"
          aria-expanded={exceptions}
          aria-controls={exceptionsId}
          onClick={() => setExceptions(!exceptions)}
          className="-mx-1 flex items-center gap-1 self-start rounded-md px-1 text-left text-ui font-medium text-fg transition-colors duration-100 ease-standard hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
        >
          <ChevronRight size={14} aria-hidden className={cn('shrink-0 text-fg-subtle transition duration-160 ease-standard', exceptions && 'rotate-90')} />
          {m.settings.permissions.exceptions}
          {!exceptions && count > 0 && <span className="ml-1 text-small font-normal text-fg-subtle">{m.settings.permissions.exceptionsCount(count)}</span>}
        </button>
        {exceptions && (
          <div id={exceptionsId} className="flex flex-col gap-4">
            <p className="text-small text-fg-muted">{m.settings.permissions.exceptionsHint}</p>
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
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="primary" disabled={unchanged} loading={saving} onClick={() => void save()}>
          {m.settings.permissions.save}
        </Button>
      </div>
    </div>
  )
}
