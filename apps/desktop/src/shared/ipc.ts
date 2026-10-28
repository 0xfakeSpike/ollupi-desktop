// The contract between the main process and the renderer: channel names and
// the API the preload exposes as window.desktop. Both sides import it, so a
// change is checked on both ends.

import type { ConfigCheck as CheckOutput } from './generated/backend-config'
import type { SkillsCheck } from './generated/backend-skills'

/** config.yaml as the backend decodes it. */
export type BackendConfig = NonNullable<CheckOutput['config']>
/** One model as the app selects it: id is provider/name. */
export type ConfigModel = NonNullable<CheckOutput['models']>[number]
/** ollupid --check-config's result: the config with its models in order, or
 * why the backend would not start with it. */
export type ConfigCheck = { ok: true; config: BackendConfig; models: ConfigModel[] } | { ok: false; error: string }

/** The backend process as the supervisor sees it. */
export type BackendState =
  | { status: 'starting' }
  | { status: 'ready'; url: string; token: string; version: string }
  | { status: 'failed'; failure: BackendFailure; configPath: string | undefined; log: string }
  | { status: 'stopped' }

/** Why the backend is not running. The renderer words it in the app's
 * language; only what ollupi itself reported (reported.message) is shown
 * as written. */
export type BackendFailure =
  | { kind: 'timeout'; seconds: number }
  | { kind: 'spawn'; binary: string; error: string }
  | { kind: 'exited'; how: string }
  | { kind: 'reported'; message: string | undefined }

export interface AppInfo {
  version: string
  platform: string
  /** The backend's data and config directory. */
  home: string
  configPath: string
}

/** One edit to config.yaml, by key path, e.g. ['memory', 'generate']. A move
 * takes the list item at path to index `to` of the same list. */
export type ConfigChange =
  | { kind: 'set'; path: (string | number)[]; value: unknown }
  | { kind: 'delete'; path: (string | number)[] }
  | { kind: 'move'; path: (string | number)[]; to: number }

/** One model an API lists, with its limits when the API says them. */
export interface ListedModel {
  name: string
  limits?: { context: number; output: number }
}

/** The models an OpenAI-compatible API lists at GET {base_url}/models, or
 * why it could not be asked. */
export type ModelList = { ok: true; models: ListedModel[] } | { ok: false; error: string }

/** One skill as the agent loads it from its SKILL.md. */
export type Skill = NonNullable<SkillsCheck['skills']>[number]
/** The skills folder and its skills as the agent would load them, or why
 * the agent would not start with the folder. dir is empty while config.yaml
 * sets no skills_dir, which turns skills off. */
export type SkillList = { ok: true; dir: string; skills: Skill[] } | { ok: false; dir: string; error: string }
/** A change to the skills folder, or why the agent's rules refused it. */
export type SkillChange = { ok: true } | { ok: false; error: string }
/** What a new skill's SKILL.md is written from. */
export interface NewSkill {
  name: string
  description: string
  instructions: string
}

/** Light or dark, or whichever the system uses. */
export type ColorScheme = 'system' | 'light' | 'dark'
export const colorSchemes: readonly ColorScheme[] = ['system', 'light', 'dark']

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
  /** The folder config.yaml's skills_dir names. A change is checked with
   * the agent's own catalog before it reaches the folder; one that passes
   * restarts the backend, which loads skills only at start. */
  skills: {
    list(): Promise<SkillList>
    read(name: string): Promise<string>
    create(skill: NewSkill): Promise<SkillChange>
    save(name: string, text: string): Promise<SkillChange>
    /** Asks for a skill folder and copies it in; undefined when none was
     * chosen. */
    import(): Promise<SkillChange | undefined>
    /** Moves the skill's folder to the Trash. */
    remove(name: string): Promise<void>
    /** Creates the skills folder in the backend's home and gives the
     * skills_dir value that names it. */
    defaultFolder(): Promise<string>
  }
  /** Asks a provider's API which models it serves. The main process asks,
   * as the API would not answer the renderer's origin. An empty base URL is
   * OpenAI's, as for the backend. */
  listModels(baseUrl: string, apiKey: string): Promise<ModelList>
  pickDirectory(): Promise<string | undefined>
  openPath(path: string): Promise<void>
  /** Sets the window's scheme, which the renderer's prefers-color-scheme
   * and the native window chrome both follow. */
  setColorScheme(scheme: ColorScheme): Promise<void>
}

export const IpcChannel = {
  Info: 'app:info',
  BackendState: 'backend:state',
  BackendRestart: 'backend:restart',
  BackendChanged: 'backend:changed',
  ConfigRead: 'config:read',
  ConfigApply: 'config:apply',
  SkillsList: 'skills:list',
  SkillsRead: 'skills:read',
  SkillsCreate: 'skills:create',
  SkillsSave: 'skills:save',
  SkillsImport: 'skills:import',
  SkillsRemove: 'skills:remove',
  SkillsDefaultFolder: 'skills:defaultFolder',
  ListModels: 'models:list',
  PickDirectory: 'dialog:pickDirectory',
  OpenPath: 'shell:openPath',
  SetColorScheme: 'theme:setColorScheme',
} as const

/** Packaged builds serve the renderer from app://ollupi; the backend is told
 * to allow that origin. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ollupi'
