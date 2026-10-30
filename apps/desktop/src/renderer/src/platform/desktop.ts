// The only module that touches window.desktop, so the rest of the renderer
// depends on the typed DesktopApi rather than a global.

import type { BackendState, DesktopApi } from '../../../shared/ipc'

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}

/** Dev only: the renderer in a plain browser against a sidecar started by
 * hand, e.g. http://localhost:5173/?gateway=ws://127.0.0.1:PORT/&token=TOKEN */
function browserShim(): DesktopApi | undefined {
  if (!import.meta.env.DEV) return undefined
  const q = new URLSearchParams(location.search)
  const url = q.get('gateway')
  const token = q.get('token')
  if (!url || !token) return undefined
  const state: BackendState = { status: 'ready', url, token, version: 'browser' }
  return {
    info: async () => ({ version: 'dev', platform: 'browser', home: q.get('home') ?? '', configPath: '', backendLog: '' }),
    backend: { state: async () => state, restart: async () => {}, onState: () => () => {} },
    // A sidecar started by hand: the browser cannot reach its config file.
    config: { read: unavailable, apply: unavailable },
    skills: { list: unavailable, read: unavailable, create: unavailable, save: unavailable, import: unavailable, remove: unavailable, defaultFolder: unavailable },
    // A browser gives a file no path.
    attachments: { pathOf: () => undefined, writeTemp: unavailable, removeTemp: unavailable },
    files: { list: unavailable, read: unavailable },
    changes: { list: unavailable, diff: unavailable, stage: unavailable, unstage: unavailable, discard: unavailable, commit: unavailable },
    terminal: { open: unavailable, write: unavailable, resize: unavailable, close: unavailable, onData: () => () => {}, onExit: () => () => {} },
    browser: {
      state: unavailable,
      place: unavailable,
      open: unavailable,
      back: unavailable,
      forward: unavailable,
      reload: unavailable,
      onState: () => () => {},
      onUsed: () => () => {},
    },
    listModels: unavailable,
    // Not the app: nothing to update.
    update: { state: async () => ({ status: 'unsupported' }), check: async () => {}, download: unavailable, restart: unavailable, onState: () => () => {} },
    // A tab of a browser has no Dock and no notifications of its own.
    notify: async () => {},
    onNoticeClicked: () => () => {},
    setBadge: async () => {},
    pickDirectory: async () => prompt('Workspace folder (absolute path)') ?? undefined,
    saveFile: unavailable,
    openPath: async () => {},
    // A browser follows its own scheme.
    setColorScheme: async () => {},
  }
}

function unavailable(): never {
  throw new Error('window.desktop is unavailable; run the renderer inside the Electron app')
}

export const desktop: DesktopApi = window.desktop ??
  browserShim() ?? {
    info: unavailable,
    backend: { state: unavailable, restart: unavailable, onState: unavailable },
    config: { read: unavailable, apply: unavailable },
    skills: { list: unavailable, read: unavailable, create: unavailable, save: unavailable, import: unavailable, remove: unavailable, defaultFolder: unavailable },
    attachments: { pathOf: unavailable, writeTemp: unavailable, removeTemp: unavailable },
    files: { list: unavailable, read: unavailable },
    changes: { list: unavailable, diff: unavailable, stage: unavailable, unstage: unavailable, discard: unavailable, commit: unavailable },
    terminal: { open: unavailable, write: unavailable, resize: unavailable, close: unavailable, onData: () => () => {}, onExit: () => () => {} },
    browser: {
      state: unavailable,
      place: unavailable,
      open: unavailable,
      back: unavailable,
      forward: unavailable,
      reload: unavailable,
      onState: () => () => {},
      onUsed: () => () => {},
    },
    listModels: unavailable,
    update: { state: unavailable, check: unavailable, download: unavailable, restart: unavailable, onState: () => () => {} },
    notify: unavailable,
    onNoticeClicked: () => () => {},
    setBadge: unavailable,
    pickDirectory: unavailable,
    saveFile: unavailable,
    openPath: unavailable,
    setColorScheme: unavailable,
  }
