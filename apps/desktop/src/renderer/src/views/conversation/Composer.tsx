// The message box. It knows nothing about threads: the screen decides what
// submitting means and whether a turn is running.

import { AutoTextarea, cn, IconButton, Kbd } from '@ollupi/ui'
import { ArrowUp, ListEnd, Square } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { SendMode } from '../../domains/conversation'
import { useT } from '../../i18n'

export interface ComposerProps {
  placeholder: string
  running?: boolean
  disabled?: boolean
  /** Resolves true when the message was accepted, which clears the box. */
  onSubmit(text: string, mode: SendMode): Promise<boolean>
  onStop?(): void
  /** Controls on the toolbar's left (model, workspace...). */
  toolbar?: ReactNode
}

/** The two ways to send while a turn runs: into it, or after it. */
const pill =
  'flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-medium transition duration-100 ease-standard focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25'

export function Composer({ placeholder, running, disabled, onSubmit, onStop, toolbar }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const m = useT()
  useEffect(() => input.current?.focus(), [])

  const submit = async (mode: SendMode) => {
    const value = text.trim()
    if (!value || sending || disabled) return
    setSending(true)
    try {
      if (await onSubmit(value, mode)) setText('')
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  const blocked = !text.trim() || sending || disabled

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME composition (e.g. pinyin) uses Enter to pick a candidate.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void submit(e.altKey ? 'queue' : 'steer')
  }

  return (
    <div className="mx-auto w-full max-w-thread px-6 pb-3">
      <div className="rounded-2xl border border-line bg-raised shadow-sm transition duration-160 ease-standard focus-within:border-line-strong focus-within:shadow-md">
        <div className="px-4 pt-3">
          <AutoTextarea
            ref={input}
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
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
            <button
              type="button"
              aria-label={m.conversation.composer.send}
              title={m.conversation.composer.send}
              disabled={blocked}
              onClick={() => void submit('steer')}
              className="flex size-8 items-center justify-center rounded-full bg-ink text-ink-fg transition duration-100 ease-standard hover:opacity-85 focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
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
