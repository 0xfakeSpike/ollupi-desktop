// The models a turn can run on. The agent's configuration is fixed once it
// starts, so the list is read once per connection.

import type { Model } from '@ollupi/protocol'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'

interface ModelStore {
  list: Model[]
  /** The connection a turn uses when neither the turn nor its thread chose one. */
  fallback: string
}

export const useModels = create<ModelStore>()(() => ({ list: [], fallback: '' }))

export const modelsDomain: Domain = {
  sync: async (client) => {
    const { data, default: fallback } = await client.call('model/list', {})
    useModels.setState({ list: data, fallback })
  },
}
