import { create } from 'zustand'
import type { BackendState } from '../../../shared/ipc'

/** Gateway connection on top of the backend process state. */
export type GatewayStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting'

interface ConnectionStore {
  backend: BackendState
  gateway: GatewayStatus
  serverVersion: string
  lastError: string | undefined
  setBackend(backend: BackendState): void
  setGateway(gateway: GatewayStatus, error?: string): void
  setServerVersion(version: string): void
}

export const useConnection = create<ConnectionStore>()((set) => ({
  backend: { status: 'starting' },
  gateway: 'idle',
  serverVersion: '',
  lastError: undefined,
  setBackend: (backend) => set({ backend }),
  setGateway: (gateway, lastError) => set({ gateway, lastError }),
  setServerVersion: (serverVersion) => set({ serverVersion }),
}))
