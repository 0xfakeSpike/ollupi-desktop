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
  const tokenProfile = token.slice(token.indexOf('.') + 1)
  return {
    info: async () => ({ version: 'dev', platform: 'browser', home: q.get('home') ?? '', configPath: '', backendLog: '', userHome: '' }),
    backend: { state: async () => state, restart: async () => {}, check: async () => {}, onState: () => () => {} },
    remote: { read: async () => ({ enabled: false, url: '', accessClientId: '', hasToken: false, hasAccessSecret: false }), save: unavailable },
    // The token is the one the browser was opened with, and names the one
    // profile this tab acts as; nothing can mint another here.
    profile: {
      list: async () => ({ data: [{ id: tokenProfile, name: '', color: 'stone' }], current: tokenProfile }),
      create: unavailable,
      update: unavailable,
      delete: unavailable,
      // The tab already acts as its token's profile; any other needs a token.
      select: async (id: string) => {
        if (id !== tokenProfile) unavailable()
      },
    },
    skills: { import: unavailable },
    // The folder in the home given, which whoever started the sidecar makes:
    // a browser cannot.
    superAgentFolder: async (profile: string) => {
      const home = q.get('home')
      if (!home) throw new Error('no home given (?home=)')
      return `${home}/users/${profile}/super-agent`
    },
    // A browser gives a file no path.
    attachments: { pathOf: () => undefined, writeTemp: unavailable, removeTemp: unavailable },
    files: { list: unavailable, read: unavailable, kind: unavailable },
    changes: { list: unavailable, diff: unavailable, stage: unavailable, unstage: unavailable, discard: unavailable, commit: unavailable },
    terminal: { open: unavailable, write: unavailable, resize: unavailable, close: unavailable, onData: () => () => {}, onExit: () => () => {} },
    browser: {
      state: unavailable,
      place: unavailable,
      open: unavailable,
      newTab: unavailable,
      start: unavailable,
      selectTab: unavailable,
      closeTab: unavailable,
      // This tab has no app browser, so no tabs to close.
      forget: async () => {},
      // No tabs to give: a draft here opens none.
      handOver: async () => {},
      bookmarks: { list: unavailable, add: unavailable, remove: unavailable },
      // This tab has no app browser, so it has visited nothing.
      history: { count: async () => 0, list: unavailable, remove: unavailable, clear: unavailable },
      suggest: unavailable,
      back: unavailable,
      forward: unavailable,
      reload: unavailable,
      onState: () => () => {},
      onUsed: () => () => {},
      // No page here downloads.
      onDownloaded: () => () => {},
      // No page here asks for anything.
      onPermissionAsked: () => () => {},
      answerPermission: unavailable,
      onPermissionClosed: () => () => {},
    },
    listModels: unavailable,
    balance: async () => undefined,
    // Not the app: nothing to update.
    update: { state: async () => ({ status: 'unsupported' }), check: async () => {}, download: unavailable, restart: unavailable, onState: () => () => {} },
    // A tab of a browser has no Dock and no notifications of its own.
    notify: async () => {},
    onNoticeClicked: () => () => {},
    setBadge: async () => {},
    // A tab in a browser shows a conversation but records no presence: the
    // main process is not there to see the window.
    presence: { context: () => {}, onRows: () => () => {}, ack: () => {} },
    pickDirectory: async () => prompt('Workspace folder (absolute path)') ?? undefined,
    saveFile: unavailable,
    openPath: async () => {},
    revealFile: async () => {},
    contextMenu: async () => undefined,
    // A browser follows its own scheme.
    setColorScheme: async () => {},
    setAppIcon: async () => {},
  }
}

function unavailable(): never {
  throw new Error('window.desktop is unavailable; run the renderer inside the Electron app')
}

export const desktop: DesktopApi = window.desktop ??
  browserShim() ?? {
    info: unavailable,
    backend: { state: unavailable, restart: unavailable, check: unavailable, onState: unavailable },
    remote: { read: unavailable, save: unavailable },
    skills: { import: unavailable },
    profile: { list: unavailable, create: unavailable, update: unavailable, delete: unavailable, select: unavailable },
    superAgentFolder: unavailable,
    attachments: { pathOf: unavailable, writeTemp: unavailable, removeTemp: unavailable },
    files: { list: unavailable, read: unavailable, kind: unavailable },
    changes: { list: unavailable, diff: unavailable, stage: unavailable, unstage: unavailable, discard: unavailable, commit: unavailable },
    terminal: { open: unavailable, write: unavailable, resize: unavailable, close: unavailable, onData: () => () => {}, onExit: () => () => {} },
    browser: {
      state: unavailable,
      place: unavailable,
      open: unavailable,
      newTab: unavailable,
      start: unavailable,
      selectTab: unavailable,
      closeTab: unavailable,
      forget: unavailable,
      handOver: unavailable,
      bookmarks: { list: unavailable, add: unavailable, remove: unavailable },
      history: { count: unavailable, list: unavailable, remove: unavailable, clear: unavailable },
      suggest: unavailable,
      back: unavailable,
      forward: unavailable,
      reload: unavailable,
      onState: () => () => {},
      onUsed: () => () => {},
      onDownloaded: () => () => {},
      onPermissionAsked: () => () => {},
      answerPermission: unavailable,
      onPermissionClosed: () => () => {},
    },
    listModels: unavailable,
    balance: async () => undefined,
    update: { state: unavailable, check: unavailable, download: unavailable, restart: unavailable, onState: () => () => {} },
    notify: unavailable,
    onNoticeClicked: () => () => {},
    setBadge: unavailable,
    presence: { context: unavailable, onRows: () => () => {}, ack: unavailable },
    pickDirectory: unavailable,
    saveFile: unavailable,
    openPath: unavailable,
    revealFile: unavailable,
    contextMenu: unavailable,
    setColorScheme: unavailable,
    setAppIcon: unavailable,
  }
