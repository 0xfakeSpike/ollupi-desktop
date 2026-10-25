// The contract between the main process and the renderer: channel names and
// the API the preload script exposes as `window.desktop`. Both sides import
// this file, so a change here is checked on both ends.

export type BackendState =
  | { status: 'starting' }
  | { status: 'ready'; url: string; token: string; version: string }
  | { status: 'failed'; message: string; configPath?: string; log: string }
  | { status: 'stopped' }

export interface AppInfo {
  version: string
  platform: string
  home: string
  configPath: string
}

export interface DesktopApi {
  info(): Promise<AppInfo>
  backend: {
    state(): Promise<BackendState>
    restart(): Promise<void>
    onState(listener: (state: BackendState) => void): () => void
  }
  pickDirectory(): Promise<string | undefined>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  PickDirectory: 'dialog:pickDirectory',
  OpenPath: 'shell:openPath',
  OpenExternal: 'shell:openExternal',
} as const

/** The renderer's origin in packaged builds; the sidecar allows it. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'
