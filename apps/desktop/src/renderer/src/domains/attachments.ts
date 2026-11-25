// Images and files sent with a message. Each goes to ollupi before the
// message does, uploaded over plain HTTP from wherever the window is, as
// ollupi may run on another machine; it decides from the content what it
// accepts (PNG, JPEG, GIF and WebP images, text files, up to ten a
// message) and the message names each upload, which ollupi then stores
// with the thread. A message's attachments come back on its item and turn,
// and their content over plain HTTP too, which is kept here once read so a
// thumbnail is fetched once.

import type { Attachment, UploadResult, UserInput } from '@ollupi/protocol'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { gatewayFetch, gatewayPath } from '../gateway/http'

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

/** Sends a message as the gateway takes it: its text, then each file,
 * uploaded first. The file's type is left to ollupi, which reads it from
 * the content; the browser's guess goes by the name (a .ts file would be a
 * video). */
export async function withMessageInput<T>(text: string, files: readonly File[], send: (input: UserInput[]) => Promise<T>): Promise<T> {
  const parts: UserInput[] = text ? [{ type: 'text', text }] : []
  for (const file of files) parts.push({ type: 'upload', uploadId: (await upload(file)).uploadId })
  return send(parts)
}

/** Uploads a file for the message about to be sent; ollupi keeps it for an
 * hour unless a message takes it. */
async function upload(file: File): Promise<UploadResult> {
  const res = await gatewayFetch(gatewayPath('upload', {}), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` },
    body: file,
  })
  return (await res.json()) as UploadResult
}

/** An attachment's content, and an object URL to show it by. */
export interface AttachmentContent {
  blob: Blob
  url: string
}

/** Attachments read so far, by attachment id; null while one is being
 * read. One that could not be read is left out, for the next time it shows
 * to ask again. */
const useRead = create<Record<string, AttachmentContent | null>>()(() => ({}))

/** An attachment's content, read from the gateway the first time it is
 * asked for. */
export function useAttachment(threadId: string, attachment: Attachment): AttachmentContent | undefined {
  const content = useRead((s) => s[attachment.id])
  const { id } = attachment
  useEffect(() => {
    if (useRead.getState()[id] !== undefined) return
    useRead.setState({ [id]: null })
    void readAttachment(threadId, id).then(
      (blob) => useRead.setState({ [id]: { blob, url: URL.createObjectURL(blob) } }),
      () => useRead.setState(({ [id]: _failed, ...rest }) => rest, true),
    )
  }, [threadId, id])
  return content ?? undefined
}

/** A text attachment's content, decoded once read. */
export function useAttachmentText(threadId: string, attachment: Attachment): string | undefined {
  const content = useAttachment(threadId, attachment)
  const [text, setText] = useState<string>()
  useEffect(() => {
    if (!content) return
    let current = true
    void content.blob.text().then((t) => current && setText(t))
    return () => {
      current = false
    }
  }, [content])
  return text
}

/** A sent attachment as a file again, to go with a message once more. */
export async function attachmentFile(threadId: string, attachment: Attachment): Promise<File> {
  const blob = useRead.getState()[attachment.id]?.blob ?? (await readAttachment(threadId, attachment.id))
  return new File([blob], attachment.name, { type: attachment.mimeType })
}

/** Reads an attachment from the gateway over HTTP. */
async function readAttachment(threadId: string, attachmentId: string): Promise<Blob> {
  return (await gatewayFetch(gatewayPath('attachment', { thread: threadId, attachment: attachmentId }))).blob()
}
