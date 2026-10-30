// The images and files a message was sent with: images as thumbnails that
// open full size, text files as chips that open their text. Their content
// is read from the gateway when first shown.

import type { Attachment } from '@ollupi/protocol'
import { cn, Dialog, Spinner } from '@ollupi/ui'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useAttachmentURL } from '../../../domains/attachments'
import { useOpenThreadId } from '../../../domains/navigation'
import { useLocale, useT } from '../../../i18n'
import { fileSize } from '../../../i18n/format'
import { CodeBlock } from '../../common/Markdown'

/** A message's attachments, in the thread on screen. */
export function Attachments({ attachments, className }: { attachments: readonly Attachment[] | null | undefined; className?: string }) {
  const threadId = useOpenThreadId()
  if (!threadId || !attachments?.length) return null
  return (
    <ul className={cn('flex max-w-4/5 flex-wrap justify-end gap-2', className)}>
      {attachments.map((a) => (
        <li key={a.id}>{a.kind === 'image' ? <ImageAttachment threadId={threadId} attachment={a} /> : <FileAttachment threadId={threadId} attachment={a} />}</li>
      ))}
    </ul>
  )
}

function ImageAttachment({ threadId, attachment }: { threadId: string; attachment: Attachment }) {
  const url = useAttachmentURL(threadId, attachment)
  const [open, setOpen] = useState(false)
  const m = useT()
  return (
    <>
      <button
        type="button"
        title={attachment.name}
        onClick={() => setOpen(true)}
        className="flex size-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      >
        {url ? <img src={url} alt={attachment.name} className="size-full object-cover" /> : <Spinner size={14} />}
      </button>
      {open && url && (
        <Dialog title={attachment.name} wide closeLabel={m.common.close} onClose={() => setOpen(false)}>
          <img src={url} alt={attachment.name} className="mx-auto max-h-[70vh] rounded-md" />
        </Dialog>
      )}
    </>
  )
}

function FileAttachment({ threadId, attachment }: { threadId: string; attachment: Attachment }) {
  const [open, setOpen] = useState(false)
  const locale = useLocale((s) => s.locale)
  return (
    <>
      <button
        type="button"
        title={attachment.name}
        onClick={() => setOpen(true)}
        className="flex h-12 items-center gap-2 rounded-lg border border-line bg-surface pr-3 pl-2 text-left focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
      >
        <FileText size={18} className="shrink-0 text-fg-subtle" />
        <span className="flex max-w-48 min-w-0 flex-col">
          <span className="truncate text-small text-fg">{attachment.name}</span>
          <span className="text-small text-fg-subtle">{fileSize(locale, attachment.size)}</span>
        </span>
      </button>
      {open && <TextContent threadId={threadId} attachment={attachment} onClose={() => setOpen(false)} />}
    </>
  )
}

/** ollupi takes only text files, stored as they came. */
function TextContent({ threadId, attachment, onClose }: { threadId: string; attachment: Attachment; onClose(): void }) {
  const url = useAttachmentURL(threadId, attachment)
  const m = useT()
  return (
    <Dialog title={attachment.name} wide closeLabel={m.common.close} onClose={onClose}>
      {url ? <CodeBlock code={decodeText(url)} label={attachment.mimeType} /> : <Spinner />}
    </Dialog>
  )
}

function decodeText(dataUrl: string): string {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
