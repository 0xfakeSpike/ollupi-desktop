// Exposes DesktopApi to the sandboxed renderer. Nothing else from Node or
// Electron crosses the bridge.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type BackendState, type BrowserState, type DesktopApi, type UpdateState } from '../shared/ipc'

const api: DesktopApi = {
  info: () => ipcRenderer.invoke(IpcChannel.Info),
  backend: {
    state: () => ipcRenderer.invoke(IpcChannel.BackendState),
    restart: () => ipcRenderer.invoke(IpcChannel.BackendRestart),
    onState: (listener) => {
      const wrapped = (_e: IpcRendererEvent, state: BackendState) => listener(state)
      ipcRenderer.on(IpcChannel.BackendChanged, wrapped)
      return () => ipcRenderer.off(IpcChannel.BackendChanged, wrapped)
    },
  },
  config: {
    read: () => ipcRenderer.invoke(IpcChannel.ConfigRead),
    apply: (changes) => ipcRenderer.invoke(IpcChannel.ConfigApply, changes),
  },
  skills: {
    list: () => ipcRenderer.invoke(IpcChannel.SkillsList),
    read: (name) => ipcRenderer.invoke(IpcChannel.SkillsRead, name),
    create: (skill) => ipcRenderer.invoke(IpcChannel.SkillsCreate, skill),
    save: (name, text) => ipcRenderer.invoke(IpcChannel.SkillsSave, name, text),
    import: () => ipcRenderer.invoke(IpcChannel.SkillsImport),
    remove: (name) => ipcRenderer.invoke(IpcChannel.SkillsRemove, name),
    defaultFolder: () => ipcRenderer.invoke(IpcChannel.SkillsDefaultFolder),
  },
  files: {
    list: (root, path) => ipcRenderer.invoke(IpcChannel.FilesList, root, path),
    read: (root, path) => ipcRenderer.invoke(IpcChannel.FilesRead, root, path),
  },
  changes: {
    list: (root) => ipcRenderer.invoke(IpcChannel.ChangesList, root),
    diff: (root, path, untracked) => ipcRenderer.invoke(IpcChannel.ChangesDiff, root, path, untracked),
    stage: (root, paths) => ipcRenderer.invoke(IpcChannel.ChangesStage, root, paths),
    unstage: (root, paths) => ipcRenderer.invoke(IpcChannel.ChangesUnstage, root, paths),
    discard: (root, file) => ipcRenderer.invoke(IpcChannel.ChangesDiscard, root, file),
    commit: (root, message) => ipcRenderer.invoke(IpcChannel.ChangesCommit, root, message),
  },
  terminal: {
    open: (key, cwd, cols, rows) => ipcRenderer.invoke(IpcChannel.TerminalOpen, key, cwd, cols, rows),
    write: (key, text) => ipcRenderer.invoke(IpcChannel.TerminalWrite, key, text),
    resize: (key, cols, rows) => ipcRenderer.invoke(IpcChannel.TerminalResize, key, cols, rows),
    close: (key) => ipcRenderer.invoke(IpcChannel.TerminalClose, key),
    onData: (listener) => {
      const wrapped = (_e: IpcRendererEvent, key: string, text: string) => listener(key, text)
      ipcRenderer.on(IpcChannel.TerminalData, wrapped)
      return () => ipcRenderer.off(IpcChannel.TerminalData, wrapped)
    },
    onExit: (listener) => {
      const wrapped = (_e: IpcRendererEvent, key: string, code: number) => listener(key, code)
      ipcRenderer.on(IpcChannel.TerminalExit, wrapped)
      return () => ipcRenderer.off(IpcChannel.TerminalExit, wrapped)
    },
  },
  browser: {
    state: (thread) => ipcRenderer.invoke(IpcChannel.BrowserState, thread),
    place: (thread, bounds) => ipcRenderer.invoke(IpcChannel.BrowserPlace, thread, bounds),
    open: (thread, url) => ipcRenderer.invoke(IpcChannel.BrowserOpen, thread, url),
    back: (thread) => ipcRenderer.invoke(IpcChannel.BrowserBack, thread),
    forward: (thread) => ipcRenderer.invoke(IpcChannel.BrowserForward, thread),
    reload: (thread) => ipcRenderer.invoke(IpcChannel.BrowserReload, thread),
    onState: (listener) => {
      const wrapped = (_e: IpcRendererEvent, thread: string, state: BrowserState) => listener(thread, state)
      ipcRenderer.on(IpcChannel.BrowserChanged, wrapped)
      return () => ipcRenderer.off(IpcChannel.BrowserChanged, wrapped)
    },
    onUsed: (listener) => {
      const wrapped = (_e: IpcRendererEvent, thread: string) => listener(thread)
      ipcRenderer.on(IpcChannel.BrowserUsed, wrapped)
      return () => ipcRenderer.off(IpcChannel.BrowserUsed, wrapped)
    },
  },
  listModels: (type, baseUrl, apiKey) => ipcRenderer.invoke(IpcChannel.ListModels, type, baseUrl, apiKey),
  update: {
    state: () => ipcRenderer.invoke(IpcChannel.UpdateState),
    check: () => ipcRenderer.invoke(IpcChannel.UpdateCheck),
    download: () => ipcRenderer.invoke(IpcChannel.UpdateDownload),
    restart: () => ipcRenderer.invoke(IpcChannel.UpdateRestart),
    onState: (listener) => {
      const wrapped = (_e: IpcRendererEvent, state: UpdateState) => listener(state)
      ipcRenderer.on(IpcChannel.UpdateChanged, wrapped)
      return () => ipcRenderer.off(IpcChannel.UpdateChanged, wrapped)
    },
  },
  notify: (notice) => ipcRenderer.invoke(IpcChannel.Notify, notice),
  onNoticeClicked: (listener) => {
    const wrapped = (_e: IpcRendererEvent, threadId: string) => listener(threadId)
    ipcRenderer.on(IpcChannel.NoticeClicked, wrapped)
    return () => ipcRenderer.off(IpcChannel.NoticeClicked, wrapped)
  },
  setBadge: (count) => ipcRenderer.invoke(IpcChannel.SetBadge, count),
  pickDirectory: () => ipcRenderer.invoke(IpcChannel.PickDirectory),
  saveFile: (name, text) => ipcRenderer.invoke(IpcChannel.SaveFile, name, text),
  openPath: (path) => ipcRenderer.invoke(IpcChannel.OpenPath, path),
  setColorScheme: (scheme) => ipcRenderer.invoke(IpcChannel.SetColorScheme, scheme),
}

contextBridge.exposeInMainWorld('desktop', api)
