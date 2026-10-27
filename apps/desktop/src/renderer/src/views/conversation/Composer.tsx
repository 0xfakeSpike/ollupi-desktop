// The message box. It knows nothing about threads: the screen decides what
// submitting means and whether a turn is running.

import { AutoTextarea, IconButton, Kbd } from '@ollupi/ui'
import { ArrowUp, Square } from 'lucide-react'
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
          <button
            type="button"
            aria-label={m.conversation.composer.send}
            title={running ? m.conversation.composer.addToTurn : m.conversation.composer.send}
            disabled={!text.trim() || sending || disabled}
            onClick={() => void submit('steer')}
            className="flex size-8 items-center justify-center rounded-full bg-ink text-ink-fg transition duration-100 ease-standard hover:opacity-85 focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-25"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-3 text-small text-fg-subtle">
        {running ? (
          <>
            <span>{m.conversation.composer.addsToTurn(<Kbd>Enter</Kbd>)}</span>
            <span>{m.conversation.composer.queues(<Kbd>⌥ Enter</Kbd>)}</span>
          </>
        ) : (
          <span>{m.conversation.composer.idle(<Kbd>Enter</Kbd>, <Kbd>Shift Enter</Kbd>)}</span>
        )}
      </div>
    </div>
  )
}
