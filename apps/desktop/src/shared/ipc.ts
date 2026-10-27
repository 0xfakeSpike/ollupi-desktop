// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

import type { ConfigCheck as CheckOutput } from './generated/backend-config'

/** config.yaml as the backend decodes it, API keys left out. */
export type BackendConfig = NonNullable<CheckOutput['config']>
/** One model as the app selects it: id is provider/name. */
export type ConfigModel = NonNullable<CheckOutput['models']>[number]
/** ollupid --check-config's result: the config with its models in order,
 * or why the backend would not start with it. */
export type ConfigCheck = { ok: true; config: BackendConfig; models: ConfigModel[] } | { ok: false; error: string }

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
