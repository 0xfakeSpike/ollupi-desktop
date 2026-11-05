// What the person does in the app's browser that can fail, as notices.

import type { Bookmark } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { desktop } from '../platform/desktop'

export function openPage(thread: string, url: string): Promise<void | undefined> {
  return run((e) => e.browser.open, () => desktop.browser.open(thread, url))
}

export function addBookmark(url: string, title: string): Promise<Bookmark[] | undefined> {
  return run((e) => e.browser.bookmark, () => desktop.browser.bookmarks.add(url, title))
}

export function removeBookmark(url: string): Promise<Bookmark[] | undefined> {
  return run((e) => e.browser.bookmark, () => desktop.browser.bookmarks.remove(url))
}

export function clearHistory(): Promise<boolean> {
  return run((e) => e.browser.clearHistory, async () => {
    await desktop.browser.history.clear()
    return true
  }).then(Boolean)
}
