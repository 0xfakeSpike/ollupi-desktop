// config.yaml's feishu: the Feishu (Lark) bot sessions are driven through
// from a phone. The backend connects it at start, so a change, like the
// models', is checked by the backend, written, and the backend restarted.

import type { ConfigChange } from '../../../shared/ipc'
import type { CheckedConfig } from './backendConfig'

export type FeishuConfig = NonNullable<CheckedConfig['config']['feishu']>

export const feishuDomains = ['feishu', 'lark'] as const
export type FeishuDomain = (typeof feishuDomains)[number]

/** The section's form; users as typed, one open_id per line. */
export interface FeishuFields {
  appId: string
  appSecret: string
  domain: FeishuDomain
  users: string
  /** The workspace's folder; empty for none. */
  workspace: string
}

export function feishuFields(c: FeishuConfig | null | undefined): FeishuFields {
  return {
    appId: c?.app_id ?? '',
    appSecret: c?.app_secret ?? '',
    domain: c?.domain === 'lark' ? 'lark' : 'feishu',
    users: (c?.users ?? []).join('\n'),
    workspace: c?.workspace ?? '',
  }
}

/** The open_ids typed, split on lines, spaces or commas, once each. */
export function parseUsers(text: string): string[] {
  return [...new Set(text.split(/[\s,，]+/).filter(Boolean))]
}

/** Writes the whole section, leaving out what is at its default. */
export function saveFeishu(f: FeishuFields): ConfigChange[] {
  const users = parseUsers(f.users)
  const value = {
    app_id: f.appId.trim(),
    app_secret: f.appSecret.trim(),
    ...(f.domain !== 'feishu' && { domain: f.domain }),
    ...(users.length > 0 && { users }),
    ...(f.workspace && { workspace: f.workspace }),
  }
  return [{ kind: 'set', path: ['feishu'], value }]
}

export function removeFeishu(): ConfigChange[] {
  return [{ kind: 'delete', path: ['feishu'] }]
}
