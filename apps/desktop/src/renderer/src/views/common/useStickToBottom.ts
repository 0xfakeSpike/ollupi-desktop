import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const NEAR_PX = 80

/** Keeps a scroll container at the bottom while content streams in, unless
 * the user scrolled up to read. Changing `key` (the thread) re-pins it. The
 * container must be rendered from the first render on. */
export function useStickToBottom<T extends HTMLElement>(key: string) {
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

  useLayoutEffect(() => scrollToBottom(), [key, scrollToBottom])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_PX
      setAtBottom(pinned.current)
    }
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
