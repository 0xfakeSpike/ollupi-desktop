// Renames in place: the title becomes a field, Enter or leaving it saves,
// Escape gives up. An unchanged or empty title saves nothing.

import { MAX_TITLE_LENGTH } from '@ollupi/core'
import { cn } from '@ollupi/ui'
import { useEffect, useRef, useState } from 'react'

export function TitleInput({ initial, label, className, onSave, onDone }: { initial: string; label: string; className?: string; onSave(title: string): Promise<boolean>; onDone(): void }) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  const settled = useRef(false)
  useEffect(() => input.current?.select(), [])

  const finish = async (save: boolean) => {
    if (settled.current) return
    settled.current = true
    const title = value.trim()
    if (save && title && title !== initial) await onSave(title)
    onDone()
  }

  return (
    <input
      ref={input}
      aria-label={label}
      value={value}
      maxLength={MAX_TITLE_LENGTH}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void finish(true)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') void finish(true)
        else if (e.key === 'Escape') void finish(false)
      }}
      className={cn('min-w-0 rounded-md border border-accent bg-canvas px-1.5 text-fg ring-3 ring-focus outline-none', className)}
    />
  )
}
