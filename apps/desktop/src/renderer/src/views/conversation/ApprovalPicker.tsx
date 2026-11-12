// The approval policy on the message box, beside the model: what the next
// turns run under, which is how much the agent may do on this computer
// without asking. It says so with a shield, and the loosest policy, which
// asks nothing, is drawn in the warning colour. A thread's own policy, or
// for a new conversation the one it will start with; without one it
// inherits its workspace's, else the agent's in config.yaml
// (agent/permission.Resolve, the last one set wins). The choices say what
// each one lets through; the thread's rules are one more step from here.

import type { ApprovalPolicy } from '@ollupi/protocol'
import { cn, Picker, type PickerAction, type PickerOption } from '@ollupi/ui'
import { ChevronDown, ListChecks, Shield, ShieldAlert } from 'lucide-react'
import { useT } from '../../i18n'
import { approvalPolicies } from '../settings/PermissionEditor'
import { chip } from './Composer'

const INHERIT = ''

export function ApprovalPicker({
  value,
  inherited,
  from,
  onChange,
  onRules,
}: {
  /** The thread's own, or the draft's choice; undefined inherits. */
  value: ApprovalPolicy | undefined
  /** What it inherits, when known. */
  inherited: ApprovalPolicy | undefined
  /** Where it inherits from: the workspace, or the agent's defaults. */
  from: string
  onChange(policy: ApprovalPolicy | undefined): void
  /** Opens the thread's own permission rules; a draft has none yet. */
  onRules?(): void
}) {
  const m = useT()
  const t = m.conversation.composer
  const policies = approvalPolicies(m)
  const label = (p: ApprovalPolicy | undefined) => policies.find((x) => x.value === p)?.label
  const effective = value ?? inherited
  const shown = label(effective)
  const loose = effective === 'never'
  const options: PickerOption<ApprovalPolicy | typeof INHERIT>[] = [
    { value: INHERIT, label: t.approvalInherit(from, label(inherited)), description: policies.find((p) => p.value === inherited)?.hint },
    ...policies.map((p) => ({ value: p.value, label: p.label, description: p.hint })),
  ]
  const actions: PickerAction[] = onRules ? [{ label: t.approvalRules, icon: <ListChecks size={14} />, onSelect: onRules }] : []
  return (
    <Picker
      label={t.approvalLabel}
      value={value ?? INHERIT}
      options={options}
      onChange={(v) => onChange(v || undefined)}
      actions={actions}
      width={380}
      className={cn(chip, 'gap-1', loose && 'border-warning/40 text-warning hover:text-warning')}
    >
      {loose ? <ShieldAlert size={14} className="shrink-0" aria-hidden /> : <Shield size={14} className="shrink-0" aria-hidden />}
      <span className="truncate">{shown ? t.approval(shown) : t.approvalLabel}</span>
      <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />
    </Picker>
  )
}
