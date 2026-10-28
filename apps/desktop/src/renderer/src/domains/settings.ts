// ollupi's global settings: the redaction switch, which masks sensitive
// values before they reach a model. ollupi stores it and reads it before
// every model call, so a change applies from the next call. Read once
// connected; every change, from this client or another, arrives as
// settings/changed, which is what is applied, not settings/update's result.

import type { SettingsRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'

/** Undefined until read on a connection. */
export const useSettings = create<{ settings: SettingsRow | undefined }>()(() => ({ settings: undefined }))

export const settingsDomain: Domain = {
  bind: (client) => client.on('settings/changed', (settings) => useSettings.setState({ settings })),
  sync: async (client) => {
    useSettings.setState({ settings: await client.call('settings/read', {}) })
  },
  disconnect: () => useSettings.setState({ settings: undefined }),
}

export function setRedaction(on: boolean): Promise<void | undefined> {
  return run((e) => e.settings.redaction, async () => {
    await gateway().call('settings/update', { redaction: on })
  })
}
