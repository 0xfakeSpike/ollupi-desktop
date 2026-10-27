// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

import type { BackendConfig } from './generated/backend-config'

export type { BackendConfig }

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

/** The result of checking a config with the backend (ollupid
 * --check-config): the config as decoded, API keys left out, or why the
 * backend would not start with it. */
export type ConfigCheck = { ok: true; config: BackendConfig } | { ok: false; error: string }

/** One edit to config.yaml, by key path, e.g. ['memory', 'generate']. */
export type ConfigChange = { kind: 'set'; path: (string | number)[]; value: unknown } | { kind: 'delete'; path: (string | number)[] }

export interface DesktopApi {
  info(): Promise<AppInfo>
  backend: {
    state(): Promise<BackendState>
    restart(): Promise<void>
    onState(listener: (state: BackendState) => void): () => void
  }
  config: {
    read(): Promise<ConfigCheck>
    /** Validates the changed file with the backend; when it passes, writes it
     * and restarts the backend, since ollupi reads its config only at start. */
    apply(changes: ConfigChange[]): Promise<ConfigCheck>
  }
  pickDirectory(): Promise<string | undefined>
  openPath(path: string): Promise<void>
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  ConfigRead: 'config:read',
  ConfigApply: 'config:apply',
  PickDirectory: 'dialog:pickDirectory',
  OpenPath: 'shell:openPath',
} as const

/** Packaged builds serve the renderer from app://ollupi; the backend is told
 * to allow that origin. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'
