// The tools the agent offers its model (tool/list): read once per
// connection, and again when the MCP servers change (domains/mcp).

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

