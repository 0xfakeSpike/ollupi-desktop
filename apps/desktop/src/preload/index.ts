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
  pickDirectory: () => ipcRenderer.invoke(IpcChannel.PickDirectory),
  openPath: (path) => ipcRenderer.invoke(IpcChannel.OpenPath, path),
}

contextBridge.exposeInMainWorld('desktop', api)
