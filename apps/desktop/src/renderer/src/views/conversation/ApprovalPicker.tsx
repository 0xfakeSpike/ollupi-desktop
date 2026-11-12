// The approval policy on the message box, beside the model: what the next
// turns run under. A thread's own policy, or for a new conversation the one
// it will start with; without one it inherits its workspace's, else the
// agent's in config.yaml (agent/permission.Resolve, the last one set wins).

import type { ApprovalPolicy } from '@ollupi/protocol'
import { useT } from '../../i18n'
import { approvalPolicies } from '../settings/PermissionEditor'
import { chip } from './Composer'

const INHERIT = ''

export function ApprovalPicker({
  value,
  inherited,
  from,
  onChange,
}: {
  /** The thread's own, or the draft's choice; undefined inherits. */
  value: ApprovalPolicy | undefined
  /** What it inherits, when known. */
  inherited: ApprovalPolicy | undefined
  /** Where it inherits from: the workspace, or the agent's defaults. */
  from: string
  onChange(policy: ApprovalPolicy | undefined): void
}) {
  const m = useT()
  const t = m.conversation.composer
  const policies = approvalPolicies(m)
  const label = (p: ApprovalPolicy | undefined) => policies.find((x) => x.value === p)?.label
  const shown = label(value ?? inherited)
  return (
    <label className={chip} title={policies.find((x) => x.value === (value ?? inherited))?.hint}>
      <span className="truncate">{shown ? t.approval(shown) : t.approvalLabel}</span>
      <select
        aria-label={t.approvalLabel}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value ?? INHERIT}
        onChange={(e) => onChange((e.target.value || undefined) as ApprovalPolicy | undefined)}
      >
        <option value={INHERIT}>{t.approvalInherit(from, label(inherited))}</option>
        {policies.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  )
}
