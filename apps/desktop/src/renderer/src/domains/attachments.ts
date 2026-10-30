// Images and files sent with a message. ollupi takes each by its path on
// this machine and copies it while it takes the message; it decides from
// the content what it accepts (PNG, JPEG, GIF and WebP images, text files,
// up to ten a message) and stores the copies with the thread. A message's
// attachments come back on its item and turn, and their content through
// attachment/read, which is kept here once read so a thumbnail is fetched
// once.

import type { Attachment, UserInput } from '@ollupi/protocol'
import { useEffect } from 'react'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import { desktop } from '../platform/desktop'

/** A file the person picked, pasted or dropped, before it is sent. */
export interface DraftAttachment {
  id: string
  file: File
  /** An object URL to show an image before it is sent. */
  preview: string | undefined
}

let nextId = 1

export function draftAttachment(file: File): DraftAttachment {
  return { id: String(nextId++), file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }
}

export function releaseDraft(d: DraftAttachment): void {
  if (d.preview) URL.revokeObjectURL(d.preview)
}

/** Sends a message as the gateway takes it: its text, then each file by
 * path. A file that has none (pasted, or dragged from a web page) is
 * written to a temporary file first, removed once send returns: by then
 * ollupi has copied it, or refused the message. The file's type is left to
 * ollupi, which reads it from the content; the browser's guess goes by the
 * name (a .ts file would be a video). */
export async function withMessageInput<T>(text: string, files: readonly File[], send: (input: UserInput[]) => Promise<T>): Promise<T> {
  const temps: string[] = []
  try {
    const parts: UserInput[] = text ? [{ type: 'text', text }] : []
    for (const file of files) {
      let path = desktop.attachments.pathOf(file)
      if (!path) temps.push((path = await desktop.attachments.writeTemp(file.name, new Uint8Array(await file.arrayBuffer()))))
      parts.push({ type: 'file', path, name: file.name })
    }
    return await send(parts)
  } finally {
    for (const path of temps) void desktop.attachments.removeTemp(path)
  }
}

/** Data URLs of attachments read so far, by attachment id; null while one
 * is being read or when it could not be. */
const useRead = create<Record<string, string | null>>()(() => ({}))

/** An attachment's content as a data URL, read from the gateway the first
 * time it is asked for. */
export function useAttachmentURL(threadId: string, attachment: Attachment): string | undefined {
  const url = useRead((s) => s[attachment.id])
  const { id, mimeType } = attachment
  useEffect(() => {
    if (useRead.getState()[id] !== undefined) return
    useRead.setState({ [id]: null })
    void gateway()
      .call('attachment/read', { threadId, attachmentId: id })
      .then(
        ({ data }) => useRead.setState({ [id]: `data:${mimeType};base64,${data}` }),
        () => useRead.setState({ [id]: null }),
      )
  }, [threadId, id, mimeType])
  return url ?? undefined
}
