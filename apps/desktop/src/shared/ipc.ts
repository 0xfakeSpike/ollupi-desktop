// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

/** The backend process as the supervisor sees it. */
export type BackendState =
  | { status: 'starting' }
  | { status: 'ready'; url: string; token: string; version: string }
  | { status: 'failed'; message: string; configPath: string | undefined; log: string }
  | { status: 'stopped' }

export interface AppInfo {
  version: string
  platform: string
  /** The backend's data and config directory. */
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
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  PickDirectory: 'dialog:pickDirectory',
  OpenPath: 'shell:openPath',
} as const

/** Packaged builds serve the renderer from app://ollupi; the backend is told
 * to allow that origin. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'
