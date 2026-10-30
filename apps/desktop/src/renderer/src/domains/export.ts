// Saving a whole thread as a file: Markdown to read, or JSON with every
// item as ollupi stores it. The thread is read in full first, page by page,
// whatever the timeline on screen has loaded.

import { oldestSeq, prependPage, timelineFromPage, type Timeline } from '@ollupi/core'
import { gateway } from '../gateway/connection'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { threadTitle } from '../i18n/format'
import { desktop } from '../platform/desktop'
import { notify } from './notices'
import { threadMarkdown } from './threadMarkdown'

export type ExportFormat = 'markdown' | 'json'

const PAGE_SIZE = 100

async function readWhole(threadId: string): Promise<Timeline> {
  let whole = timelineFromPage(await gateway().call('thread/read', { threadId, limit: PAGE_SIZE }))
  for (let before = oldestSeq(whole); whole.hasMore && before !== undefined; before = oldestSeq(whole)) {
    whole = prependPage(whole, await gateway().call('thread/read', { threadId, beforeSeq: before, limit: PAGE_SIZE }))
  }
  return whole
}

export function exportThread(threadId: string, format: ExportFormat): Promise<void | undefined> {
  return run((e) => e.thread.export, async () => {
    const whole = await readWhole(threadId)
    const m = t()
    const title = threadTitle(m, whole.thread)
    const text = format === 'json' ? JSON.stringify(whole, null, 2) + '\n' : threadMarkdown(whole, { title, ...m.conversation.export.words })
    const saved = await desktop.saveFile(`${fileName(title)}.${format === 'json' ? 'json' : 'md'}`, text)
    if (saved) notify(m.conversation.export.saved(saved), 'info')
  })
}

/** A title as a file name: without the characters macOS and other systems
 * refuse in one. */
function fileName(title: string): string {
  return title.replace(/[/\\:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80) || 'thread'
}
