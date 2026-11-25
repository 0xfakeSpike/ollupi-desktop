// The models a turn can run on: the ones the deployment's catalog serves,
// and the one this profile's conversations start with. The list is read once
// per connection, follows every change to the catalog (model/changed), and is
// read again when the profile's settings change, which hold its choice.

import type { Model, ModelChangedNotification } from '@ollupi/protocol'
import type { OllupiClient } from '@ollupi/client'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'

interface ModelStore {
  list: Model[]
  /** The connection a turn uses when neither the turn nor its thread chose one. */
  fallback: string
}

export const useModels = create<ModelStore>()(() => ({ list: [], fallback: '' }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ data, default: fallback, seq }: ModelChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useModels.setState({ list: data ?? [], fallback })
}

async function load(client: OllupiClient): Promise<void> {
  const { result, newer } = await client.snapshot('model/list', {}, ['model/changed'])
  seen = result.seq
  useModels.setState({ list: result.data, fallback: result.default })
  newer.forEach((e) => changed(e.params))
}

export const modelsDomain: Domain = {
  bind: (client) => {
    const offs = [client.on('model/changed', changed), client.on('settings/changed', () => void load(client).catch(() => {}))]
    return () => offs.forEach((off) => off())
  },
  sync: load,
  disconnect: () => {
    seen = 0
    useModels.setState({ list: [], fallback: '' })
  },
}
