// System notifications and the Dock badge. The renderer decides what is
// worth telling (it follows the gateway); here a notice is shown only while
// the person is not looking at the app, and clicking one brings the window
// back.

import { app, BrowserWindow, Notification } from 'electron'
import type { ThreadNotice } from '../shared/ipc'
import { showMainWindow } from './window'

/** Held until clicked or closed: a notification the garbage collector takes
 * no longer reports its click. */
const shown = new Set<Notification>()

export function showNotice(notice: ThreadNotice, onClick: (threadId: string) => void): void {
  if (BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return
  const n = new Notification({ title: notice.title, body: notice.body })
  shown.add(n)
  n.on('click', () => {
    shown.delete(n)
    showMainWindow()
    onClick(notice.threadId)
  })
  n.on('close', () => shown.delete(n))
  n.show()
}

export function setBadge(count: number): void {
  app.dock?.setBadge(count > 0 ? String(count) : '')
}
