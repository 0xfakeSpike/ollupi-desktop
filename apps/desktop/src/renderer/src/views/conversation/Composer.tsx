// The message box. It knows nothing about threads: the screen says which
// draft the box holds, decides what submitting means, and whether a turn is
// running. Files picked, pasted or dropped on it go with the message. The
// draft itself is kept by domain/drafts, so it outlives the box: switching
// conversations and coming back leaves the text where it was.

import { AutoTextarea, cn, IconButton, useTooltip } from '@ollupi/ui'
import { ArrowUp, FileText, ListEnd, Paperclip, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { DraftAttachment } from '../../domains/attachments'
import { addDraftFiles, removeDraftAttachment, sentDraft, setDraftText, useDraft, useDrafts } from '../../domains/drafts'
import type { Message, SendMode } from '../../domains/conversation'
import { useLocale, useT } from '../../i18n'
import { fileSize } from '../../i18n/format'

export interface ComposerProps {
  /** The draft this box holds and writes to: a conversation's, or the
   * new-conversation page's (NEW_CONVERSATION). */
  draft: string
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
  'flex h-9 items-center gap-1.5 rounded-full px-4 text-ui font-semibold transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25'

/** A choice on the box's toolbar (environment, workspace, model, approval
 * policy): a small capsule on the sheet's colour, set on the box's stone. */
export const chip =
  'relative flex h-8 max-w-72 min-w-0 shrink items-center rounded-full bg-canvas px-3 text-small font-medium text-fg-muted transition-colors duration-100 ease-standard hover:text-fg focus-within:ring-3 focus-within:ring-focus'

export function Composer({ draft, placeholder, running, disabled, onSubmit, onStop, toolbar }: ComposerProps) {
  const { text, attachments } = useDraft(draft)
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const m = useT()
  const t = m.conversation.composer
  const sendTip = useTooltip({ label: t.send, hint: t.sendHint })
  const interjectTip = useTooltip({ label: t.interject, hint: t.interjectHint })
  const queueTip = useTooltip({ label: t.queue, hint: t.queueHint })
  // A draft put back after a reload or a switch, or a sent message given
  // back to edit, is there to be continued: the caret goes after it, not
  // where the browser focuses a filled box.
  const reopened = useDrafts((s) => s.reopened[draft])
  useEffect(() => {
    const box = input.current
    if (!box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }, [reopened])

  const attach = (files: Iterable<File>) => addDraftFiles(draft, files)
  const detach = (id: string) => removeDraftAttachment(draft, id)

  const submit = async (mode: SendMode) => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || sending || disabled) return
    setSending(true)
    try {
      if (await onSubmit({ text: value, files: attachments.map((a) => a.file) }, mode)) {
        // What was typed or attached while it went stays for the next message.
        sentDraft(draft, { text, attachments })
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
    <div data-composer className="relative mx-auto w-full max-w-thread px-6 pb-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          // A container, so the toolbar can give way in order as the box narrows.
          '@container relative flex flex-col gap-3 rounded-4xl bg-surface pt-4 pr-3 pb-3 pl-5 transition duration-160 ease-standard',
          dragging && 'ring-3 ring-focus',
        )}
      >
        {attachments.length > 0 && (
          <ul aria-label={t.attachments} className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <AttachmentChip draft={a} onRemove={() => detach(a.id)} />
              </li>
            ))}
          </ul>
        )}
        <AutoTextarea
          ref={input}
          aria-label={t.inputLabel}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraftText(draft, e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <div className="flex items-center gap-2">
          <IconButton label={t.attach} disabled={disabled} className="size-8 bg-canvas" onClick={() => picker.current?.click()}>
            <Paperclip size={14} />
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
          <div className="-m-1 flex min-w-0 flex-1 items-center gap-2 overflow-hidden p-1">{toolbar}</div>
          {running && onStop && (
            <IconButton label={t.stop} hint="Esc" onClick={onStop} className="size-9 bg-canvas text-fg">
              <Square size={12} fill="currentColor" />
            </IconButton>
          )}
          {running ? (
            <>
              <button type="button" disabled={blocked} onClick={() => void submit('queue')} aria-label={t.queue} className={cn(pill, 'shrink-0 bg-canvas text-fg hover:text-fg-muted')} {...queueTip.trigger}>
                <ListEnd size={14} />
                {/* In a narrow box the two sends keep their icons and tooltips; the policy keeps its words. */}
                <span className="hidden @2xl:inline">{t.queue}</span>
              </button>
              {queueTip.tooltip}
              <button type="button" disabled={blocked} onClick={() => void submit('steer')} aria-label={t.interject} className={cn(pill, 'shrink-0 bg-send text-send-fg hover:opacity-90')} {...interjectTip.trigger}>
                <ArrowUp size={16} strokeWidth={2.25} />
                <span className="hidden @2xl:inline">{t.interject}</span>
              </button>
              {interjectTip.tooltip}
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label={t.send}
                disabled={blocked}
                onClick={() => void submit('steer')}
                className="flex size-10 items-center justify-center rounded-full bg-send text-send-fg transition duration-100 ease-standard hover:opacity-90 focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25"
                {...sendTip.trigger}
              >
                <ArrowUp size={16} strokeWidth={2.25} />
              </button>
              {sendTip.tooltip}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentChip({ draft, onRemove }: { draft: DraftAttachment; onRemove(): void }) {
  const m = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <div className="group relative flex h-14 items-center gap-2 rounded-2xl bg-canvas pr-3.5 pl-1" title={draft.file.name}>
      {draft.preview ? (
        <img src={draft.preview} alt={draft.file.name} className="size-12 rounded-xl object-cover" />
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
