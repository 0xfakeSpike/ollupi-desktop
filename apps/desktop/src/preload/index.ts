// Exposes DesktopApi to the sandboxed renderer. Nothing else from Node or
// Electron crosses the bridge.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type BackendState, type BrowserDownload, type BrowserPermission, type BrowserState, type DesktopApi, type PresenceBatch, type UpdateState } from '../shared/ipc'

const api: DesktopApi = {
  info: () => ipcRenderer.invoke(IpcChannel.Info),
  backend: {
    state: () => ipcRenderer.invoke(IpcChannel.BackendState),
    restart: () => ipcRenderer.invoke(IpcChannel.BackendRestart),
    check: () => ipcRenderer.invoke(IpcChannel.BackendCheck),
    onState: (listener) => {
      const wrapped = (_e: IpcRendererEvent, state: BackendState) => listener(state)
      ipcRenderer.on(IpcChannel.BackendChanged, wrapped)
      return () => ipcRenderer.off(IpcChannel.BackendChanged, wrapped)
    },
  },
  remote: {
    read: () => ipcRenderer.invoke(IpcChannel.RemoteRead),
    save: (input) => ipcRenderer.invoke(IpcChannel.RemoteSave, input),
  },
  skills: {
    import: () => ipcRenderer.invoke(IpcChannel.SkillsImport),
  },
  profile: {
    delete: (id) => ipcRenderer.invoke(IpcChannel.ProfileDelete, id),
    select: (id) => ipcRenderer.invoke(IpcChannel.ProfileSelect, id),
  },
  superAgentFolder: (profile) => ipcRenderer.invoke(IpcChannel.SuperAgentFolder, profile),
  browser: {
    state: (thread) => ipcRenderer.invoke(IpcChannel.BrowserState, thread),
    place: (thread, bounds) => ipcRenderer.invoke(IpcChannel.BrowserPlace, thread, bounds),
    open: (thread, url) => ipcRenderer.invoke(IpcChannel.BrowserOpen, thread, url),
    newTab: (thread) => ipcRenderer.invoke(IpcChannel.BrowserNewTab, thread),
    start: (thread) => ipcRenderer.invoke(IpcChannel.BrowserStart, thread),
    selectTab: (thread, id) => ipcRenderer.invoke(IpcChannel.BrowserSelectTab, thread, id),
    closeTab: (thread, id) => ipcRenderer.invoke(IpcChannel.BrowserCloseTab, thread, id),
    forget: (thread) => ipcRenderer.invoke(IpcChannel.BrowserForget, thread),
    handOver: (from, to) => ipcRenderer.invoke(IpcChannel.BrowserHandOver, from, to),
    bookmarks: {
      list: () => ipcRenderer.invoke(IpcChannel.BookmarksList),
      add: (url, title) => ipcRenderer.invoke(IpcChannel.BookmarksAdd, url, title),
      remove: (url) => ipcRenderer.invoke(IpcChannel.BookmarksRemove, url),
    },
    history: {
      count: () => ipcRenderer.invoke(IpcChannel.HistoryCount),
      list: (filter) => ipcRenderer.invoke(IpcChannel.HistoryList, filter),
      remove: (url) => ipcRenderer.invoke(IpcChannel.HistoryRemove, url),
      clear: () => ipcRenderer.invoke(IpcChannel.HistoryClear),
    },
    suggest: (query) => ipcRenderer.invoke(IpcChannel.BrowserSuggest, query),
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
    onDownloaded: (listener) => {
      const wrapped = (_e: IpcRendererEvent, thread: string, download: BrowserDownload) => listener(thread, download)
      ipcRenderer.on(IpcChannel.BrowserDownloaded, wrapped)
      return () => ipcRenderer.off(IpcChannel.BrowserDownloaded, wrapped)
    },
    onPermissionAsked: (listener) => {
      const wrapped = (_e: IpcRendererEvent, thread: string, permission: BrowserPermission) => listener(thread, permission)
      ipcRenderer.on(IpcChannel.BrowserPermissionAsked, wrapped)
      return () => ipcRenderer.off(IpcChannel.BrowserPermissionAsked, wrapped)
    },
    answerPermission: (id, allow) => ipcRenderer.invoke(IpcChannel.BrowserPermissionAnswer, id, allow),
    onPermissionClosed: (listener) => {
      const wrapped = (_e: IpcRendererEvent, thread: string, id: number) => listener(thread, id)
      ipcRenderer.on(IpcChannel.BrowserPermissionClosed, wrapped)
      return () => ipcRenderer.off(IpcChannel.BrowserPermissionClosed, wrapped)
    },
  },
  listModels: (type, baseUrl, apiKey) => ipcRenderer.invoke(IpcChannel.ListModels, type, baseUrl, apiKey),
  balance: (baseUrl, apiKey) => ipcRenderer.invoke(IpcChannel.Balance, baseUrl, apiKey),
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
  presence: {
    context: (context) => ipcRenderer.send(IpcChannel.PresenceContext, context),
    onRows: (listener) => {
      const wrapped = (_e: IpcRendererEvent, batch: PresenceBatch) => listener(batch)
      ipcRenderer.on(IpcChannel.PresenceRows, wrapped)
      return () => ipcRenderer.off(IpcChannel.PresenceRows, wrapped)
    },
    ack: (ack) => ipcRenderer.send(IpcChannel.PresenceAck, ack),
  },
  saveFile: (name, text) => ipcRenderer.invoke(IpcChannel.SaveFile, name, text),
  openPath: (path) => ipcRenderer.invoke(IpcChannel.OpenPath, path),
  revealFile: (path) => ipcRenderer.invoke(IpcChannel.RevealFile, path),
  contextMenu: (items) => ipcRenderer.invoke(IpcChannel.ContextMenu, items),
  setColorScheme: (scheme) => ipcRenderer.invoke(IpcChannel.SetColorScheme, scheme),
  setAppIcon: (theme) => ipcRenderer.invoke(IpcChannel.SetAppIcon, theme),
}

contextBridge.exposeInMainWorld('desktop', api)
