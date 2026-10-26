// The tools the agent offers its model (tool/list). Fixed for the agent's
// lifetime, so read once per connection.

import type { ToolDescriptor } from '@ollupi/protocol'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'

export const useTools = create<{ list: ToolDescriptor[] }>()(() => ({ list: [] }))

export const toolsDomain: Domain = {
  sync: async (client) => {
    const { data } = await client.call('tool/list', {})
    useTools.setState({ list: data })
  },
}
