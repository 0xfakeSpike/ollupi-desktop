// The message box. It knows nothing about threads: the screen decides what
// submitting means and whether a turn is running.

import { AutoTextarea, cn, IconButton, Kbd } from '@ollupi/ui'
import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { SendMode } from '../../services/actions/threads'

export interface ComposerProps {
  placeholder: string
  running?: boolean
  disabled?: boolean
  autoFocus?: boolean
  /** Resolves true when the message was accepted, which clears the box. */
  onSubmit(text: string, mode: SendMode): Promise<boolean>
  onStop?(): void
  /** Controls on the left of the toolbar (model, workspace…). */
  toolbar?: ReactNode
}

export function Composer({ placeholder, running, disabled, autoFocus, onSubmit, onStop, toolbar }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])

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
    // Never submit while an IME composition (e.g. pinyin) is in progress.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void submit(e.altKey ? 'queue' : 'steer')
  }

  const canSend = text.trim().length > 0 && !sending && !disabled

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-4">
      <div
        className={cn(
          'rounded-2xl border border-line-strong bg-raised shadow-sm transition',
          'focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10',
        )}
      >
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
        <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">{toolbar}</div>
          {running && onStop && (
            <IconButton label="Stop" onClick={onStop} className="rounded-full border border-line-strong">
              <Square size={12} fill="currentColor" />
            </IconButton>
          )}
          <button
            type="button"
            aria-label="Send"
            title={running ? 'Send to the running turn' : 'Send'}
            disabled={!canSend}
            onClick={() => void submit('steer')}
            className="flex size-8 items-center justify-center rounded-full bg-fg text-canvas transition hover:opacity-85 disabled:opacity-25"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex justify-center gap-3 text-[11px] text-fg-subtle">
        {running ? (
          <>
            <span>
              <Kbd>Enter</Kbd> adds to the running turn
            </span>
            <span>
              <Kbd>⌥ Enter</Kbd> queues a new turn
            </span>
          </>
        ) : (
          <span>
            <Kbd>Enter</Kbd> to send · <Kbd>Shift Enter</Kbd> for a new line
          </span>
        )}
      </div>
    </div>
  )
}
