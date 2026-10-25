// The only module that touches window.desktop, so the rest of the renderer
// depends on the typed DesktopApi rather than a global.

import type { BackendState, DesktopApi } from '../../../shared/ipc'

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}

function missing(): never {
  throw new Error('window.desktop is unavailable; the renderer must run inside the Electron shell')
}

const unavailable: DesktopApi = {
  info: missing,
  backend: { state: missing, restart: missing, onState: missing },
  pickDirectory: missing,
  openPath: missing,
  openExternal: missing,
}

/** Dev only: run the renderer in a plain browser against a sidecar started by
 * hand, e.g. http://localhost:5173/?gateway=ws://127.0.0.1:PORT/&token=TOKEN */
function browserShim(): DesktopApi | undefined {
  if (!import.meta.env.DEV) return undefined
  const q = new URLSearchParams(location.search)
  const url = q.get('gateway')
  const token = q.get('token')
  if (!url || !token) return undefined
  const state: BackendState = { status: 'ready', url, token, version: 'browser' }
  return {
    info: async () => ({ version: 'dev', platform: 'browser', home: q.get('home') ?? '', configPath: '' }),
    backend: { state: async () => state, restart: async () => {}, onState: () => () => {} },
    pickDirectory: async () => prompt('Workspace folder (absolute path)') ?? undefined,
    openPath: async () => {},
    openExternal: async (u) => void window.open(u, '_blank'),
  }
}

export const desktop: DesktopApi = window.desktop ?? browserShim() ?? unavailable
