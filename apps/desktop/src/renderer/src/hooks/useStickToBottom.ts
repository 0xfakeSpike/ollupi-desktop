import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const THRESHOLD_PX = 80

/** Keeps a scroll container pinned to the bottom while content streams in,
 * unless the user has scrolled up to read. `key` resets it (e.g. thread id). */
export function useStickToBottom<T extends HTMLElement>(key: string | undefined) {
  const ref = useRef<T | null>(null)
  const pinned = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current
    if (!el) return
    pinned.current = true
    setAtBottom(true)
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useLayoutEffect(() => {
    pinned.current = true
    scrollToBottom()
  }, [key, scrollToBottom])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD_PX
      pinned.current = near
      setAtBottom(near)
    }
    // Content changes (streaming text, new items) keep a pinned view at the end.
    const follow = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight
    }
    const resize = new ResizeObserver(follow)
    const mutate = new MutationObserver(follow)
    resize.observe(el)
    mutate.observe(el, { childList: true, subtree: true, characterData: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      resize.disconnect()
      mutate.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  return { ref, atBottom, scrollToBottom }
}
