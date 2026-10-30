// The message box. It knows nothing about threads: the screen decides what
// submitting means and whether a turn is running. Files picked, pasted or
// dropped on it go with the message.

import { AutoTextarea, cn, IconButton, Kbd, useTooltip } from '@ollupi/ui'
import { ArrowUp, FileText, ListEnd, Paperclip, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { draftAttachment, releaseDraft, type DraftAttachment } from '../../domains/attachments'
import type { Message, SendMode } from '../../domains/conversation'
import { useLocale, useT } from '../../i18n'
import { fileSize } from '../../i18n/format'

export interface ComposerProps {
  placeholder: string
  running?: boolean
  disabled?: boolean
  /** Resolves true when the message was accepted, which clears the box. */
  onSubmit(message: Message, mode: SendMode): Promise<boolean>
  onStop?(): void
  /** Controls on the toolbar's left (model, workspace...). */
  toolbar?: ReactNode
}

/** The two ways to send while a turn runs: into it, or after it. */
const pill =
  'flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-medium transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25'

export function Composer({ placeholder, running, disabled, onSubmit, onStop, toolbar }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const m = useT()
  const sendTip = useTooltip({ label: m.conversation.composer.send })
  useEffect(() => input.current?.focus(), [])
  // Previews live as long as their attachment; the last ones go with the box.
  const shown = useRef(attachments)
  shown.current = attachments
  useEffect(() => () => shown.current.forEach(releaseDraft), [])

  const attach = (files: Iterable<File>) => {
    const added = Array.from(files, draftAttachment)
    if (added.length) setAttachments((a) => [...a, ...added])
  }
  const detach = (id: string) =>
    setAttachments((a) => {
      a.filter((d) => d.id === id).forEach(releaseDraft)
      return a.filter((d) => d.id !== id)
    })

  const submit = async (mode: SendMode) => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || sending || disabled) return
    setSending(true)
    try {
      if (await onSubmit({ text: value, files: attachments.map((a) => a.file) }, mode)) {
        setText('')
        attachments.forEach(releaseDraft)
        setAttachments([])
      }
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  const blocked = (!text.trim() && attachments.length === 0) || sending || disabled

  // A pasted image (a screenshot) is a file; pasted text stays text.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length === 0) return
    e.preventDefault()
    attach(e.clipboardData.files)
  }
  const onDragOver = (e: DragEvent) => {
    if (disabled || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    setDragging(false)
    if (disabled || e.dataTransfer.files.length === 0) return
    e.preventDefault()
    attach(e.dataTransfer.files)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME composition (e.g. pinyin) uses Enter to pick a candidate.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void submit(e.altKey ? 'queue' : 'steer')
  }

  return (
    <div className="mx-auto w-full max-w-thread px-6 pb-3">
      <div
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-2xl border border-line bg-raised shadow-sm transition duration-160 ease-standard focus-within:border-line-strong focus-within:shadow-md',
          dragging && 'border-accent ring-3 ring-focus',
        )}
      >
        {attachments.length > 0 && (
          <ul aria-label={m.conversation.composer.attachments} className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((a) => (
              <li key={a.id}>
                <AttachmentChip draft={a} onRemove={() => detach(a.id)} />
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pt-3">
          <AutoTextarea
            ref={input}
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        </div>
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
          <IconButton label={m.conversation.composer.attach} disabled={disabled} onClick={() => picker.current?.click()}>
            <Paperclip size={16} />
          </IconButton>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              attach(e.target.files ?? [])
              e.target.value = ''
            }}
          />
          <div className="flex min-w-0 flex-1 items-center gap-1">{toolbar}</div>
          {running && onStop && (
            <IconButton label={m.conversation.composer.stop} onClick={onStop} className="size-8 rounded-full border border-line-strong">
              <Square size={12} fill="currentColor" />
            </IconButton>
          )}
          {running ? (
            <>
              <button type="button" title="⌥ Enter" disabled={blocked} onClick={() => void submit('queue')} className={cn(pill, 'border border-line-strong text-fg hover:bg-hover')}>
                <ListEnd size={14} />
                {m.conversation.composer.queue}
              </button>
              <button type="button" title="Enter" disabled={blocked} onClick={() => void submit('steer')} className={cn(pill, 'bg-ink text-ink-fg hover:opacity-85')}>
                <ArrowUp size={14} strokeWidth={2.5} />
                {m.conversation.composer.interject}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label={m.conversation.composer.send}
                disabled={blocked}
                onClick={() => void submit('steer')}
                className="flex size-8 items-center justify-center rounded-full bg-ink text-ink-fg transition duration-100 ease-standard hover:opacity-85 focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25"
                {...sendTip.trigger}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
              {sendTip.tooltip}
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-3 text-small text-fg-subtle">
        {running ? (
          <>
            <span>{m.conversation.composer.interjects(<Kbd>Enter</Kbd>)}</span>
            <span>{m.conversation.composer.queues(<Kbd>⌥ Enter</Kbd>)}</span>
          </>
        ) : (
          <span>{m.conversation.composer.idle(<Kbd>Enter</Kbd>, <Kbd>Shift Enter</Kbd>)}</span>
        )}
      </div>
    </div>
  )
}

function AttachmentChip({ draft, onRemove }: { draft: DraftAttachment; onRemove(): void }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <div className="group relative flex h-14 items-center gap-2 rounded-lg border border-line bg-canvas pr-3 pl-1" title={draft.file.name}>
      {draft.preview ? (
        <img src={draft.preview} alt={draft.file.name} className="size-12 rounded-md object-cover" />
      ) : (
        <span className="flex size-12 items-center justify-center text-fg-subtle">
          <FileText size={20} />
        </span>
      )}
      <span className="flex max-w-40 min-w-0 flex-col">
        <span className="truncate text-small text-fg">{draft.file.name}</span>
        <span className="text-small text-fg-subtle">{fileSize(locale, draft.file.size)}</span>
      </span>
      <button
        type="button"
        aria-label={m.conversation.composer.removeAttachment(draft.file.name)}
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border border-line bg-raised text-fg-muted shadow-sm group-hover:flex hover:text-fg focus-visible:flex"
      >
        <X size={12} />
      </button>
    </div>
  )
}
