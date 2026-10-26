// The current gateway connection and its state. Domains reach the client
// through gateway(); the session sets it. Kept apart from the session so
// domains do not import the module that imports them.

import type { OllupiClient } from '@ollupi/client'
import { create } from 'zustand'
import type { BackendState } from '../../../shared/ipc'

export type GatewayStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting'

interface ConnectionStore {
  backend: BackendState
  gateway: GatewayStatus
  /** Why the last connection attempt failed or the socket closed. */
  lastError: string | undefined
  serverVersion: string
  /** True once a connection has synced at least once. */
  synced: boolean
  /** Set when the gateway serves a different contract than the one the UI's
   * types were generated from (initialize's protocolSha256). */
  contractMismatch: { server: string; ui: string } | undefined
}

export const useConnection = create<ConnectionStore>()(() => ({
  backend: { status: 'starting' },
  gateway: 'idle',
  lastError: undefined,
  serverVersion: '',
  synced: false,
  contractMismatch: undefined,
}))

let client: OllupiClient | undefined

export function setClient(c: OllupiClient | undefined): void {
  client = c
}

/** The live client. Actions call this; offline it throws, and the action's
 * error reaches the user as a notice. */
export function gateway(): OllupiClient {
  if (!client || client.isClosed) throw new Error('Not connected to the backend')
  return client
}
