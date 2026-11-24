// The models a turn can run on: the ones the backend serves, and the one this
// profile's conversations start with. The list is read once per connection,
// again after the providers reload into the running backend, and again when
// the profile's settings change, which hold its choice.

import type { Model } from '@ollupi/protocol'
import type { OllupiClient } from '@ollupi/client'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'
import { gateway } from '../gateway/connection'

interface ModelStore {
  list: Model[]
  /** The connection a turn uses when neither the turn nor its thread chose one. */
  fallback: string
}

export const useModels = create<ModelStore>()(() => ({ list: [], fallback: '' }))

async function load(client: OllupiClient): Promise<void> {
  const { data, default: fallback } = await client.call('model/list', {})
  useModels.setState({ list: data, fallback })
}

export const modelsDomain: Domain = {
  bind: (client) => client.on('settings/changed', () => void load(client).catch(() => {})),
  sync: load,
  disconnect: () => useModels.setState({ list: [], fallback: '' }),
}

/** Reads the list again after the providers reloaded. */
export function refreshModels(): Promise<void> {
  return load(gateway())
}
