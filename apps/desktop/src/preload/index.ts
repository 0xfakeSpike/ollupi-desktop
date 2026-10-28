// Exposes DesktopApi to the sandboxed renderer. Nothing else from Node or
// Electron crosses the bridge.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type BackendState, type DesktopApi } from '../shared/ipc'

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
  listModels: (baseUrl, apiKey) => ipcRenderer.invoke(IpcChannel.ListModels, baseUrl, apiKey),
  pickDirectory: () => ipcRenderer.invoke(IpcChannel.PickDirectory),
  openPath: (path) => ipcRenderer.invoke(IpcChannel.OpenPath, path),
  setColorScheme: (scheme) => ipcRenderer.invoke(IpcChannel.SetColorScheme, scheme),
}

contextBridge.exposeInMainWorld('desktop', api)
