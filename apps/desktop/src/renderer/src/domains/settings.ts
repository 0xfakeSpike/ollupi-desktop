// The user's settings in ollupi: the redaction switch, which masks
// sensitive values before they reach a model; whether memory is on; and the
// permissions every conversation starts from, beneath its workspace's and
// its own. ollupi reads them as it needs them, so a change applies from the
// next model call or tool call. Read once connected; every change, from this
// client or another, arrives as settings/changed, which is what is applied
// when it is newer than what was read (seq), not the update's result.

import type { ApprovalPolicy, PermissionSettings, SettingsChangedNotification, SettingsRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

/** Undefined until read on a connection. */
export const useSettings = create<{ settings: SettingsRow | undefined }>()(() => ({ settings: undefined }))

/** The commit the settings were read at: a change at or before it is in them already. */
let seen = 0

function changed({ seq, ...settings }: SettingsChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useSettings.setState({ settings })
}

export const settingsDomain: Domain = {
  bind: (client) => client.on('settings/changed', changed),
  sync: async (client) => {
    const { result: { seq, ...settings }, newer } = await client.snapshot('settings/read', {}, ['settings/changed'])
    seen = seq
    useSettings.setState({ settings })
    newer.forEach((e) => changed(e.params))
  },
  disconnect: () => {
    seen = 0
    useSettings.setState({ settings: undefined })
  },
}

export function setRedaction(on: boolean): Promise<void | undefined> {
  return run((e) => e.settings.redaction, async () => {
    await gateway().call('settings/update', { redaction: on })
  })
}

/** Off, conversations neither recall nor search memory, and none is
 * learned from them. */
export function setMemory(on: boolean): Promise<void | undefined> {
  return run((e) => e.settings.memory, async () => {
    await gateway().call('settings/update', { memory: on })
  })
}

/** Off, finished turns teach no new memories, and the turns that end
 * meanwhile are passed over for good; the memories kept are still used. */
export function setLearn(on: boolean): Promise<void | undefined> {
  return run((e) => e.settings.learn, async () => {
    await gateway().call('settings/update', { learn: on })
  })
}

/** The model this profile's new conversations start with, one of those the
 * backend serves. */
export function setStartModel(id: string): Promise<void | undefined> {
  return run((e) => e.settings.model, async () => {
    await gateway().call('settings/update', { model: id })
  })
}

/** The model that learns this profile's memories; empty learns none. */
export function setLearnModel(id: string): Promise<void | undefined> {
  return run((e) => e.settings.model, async () => {
    await gateway().call('settings/update', { learnModel: id })
  })
}

/** ollupi checks the rules against the user's tools and refuses one that
 * names no tool, or a tool of a server not connected now. */
export function updateUserPermissions(settings: PermissionSettings): Promise<boolean> {
  return run((e) => e.settings.permissions, async () => {
    await gateway().call('settings/updatePermissions', settings)
    return true
  }).then(Boolean)
}

/** The user's approval policy, which a thread inherits when neither it nor
 * its workspace sets one; undefined leaves it to ollupi's default. */
export function useUserPolicy(): ApprovalPolicy | undefined {
  return useSettings((s) => s.settings?.permissions.approvalPolicy)
}
