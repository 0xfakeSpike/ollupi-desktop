// Images and files sent with a message. ollupi decides what it takes (PNG,
// JPEG, GIF and WebP images, text files, up to ten a message) and stores
// them with the thread; a message's attachments come back on its item and
// turn, and their content through attachment/read, which is kept here once
// read so a thumbnail is fetched once.

import type { Attachment, UserInput } from '@ollupi/protocol'
import { useEffect } from 'react'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'

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

/** A message as the gateway takes it: its text, then each file as base64. */
export async function messageInput(text: string, files: readonly File[]): Promise<UserInput[]> {
  const parts: UserInput[] = text ? [{ type: 'text', text }] : []
  for (const file of files) {
    parts.push({ type: file.type.startsWith('image/') ? 'image' : 'file', name: file.name, mimeType: file.type || undefined, data: await base64(file) })
  }
  return parts
}

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error(`cannot read ${file.name}`))
    reader.readAsDataURL(file)
  })
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
