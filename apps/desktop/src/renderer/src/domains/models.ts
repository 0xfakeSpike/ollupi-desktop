// The models a turn can run on. The list is read once per connection, and
// again after the main process reloads this profile's models into the
// running backend.

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
  sync: load,
  disconnect: () => useModels.setState({ list: [], fallback: '' }),
}

/** Reads the list again after the main process reloaded the models. */
export function refreshModels(): Promise<void> {
  return load(gateway())
}
