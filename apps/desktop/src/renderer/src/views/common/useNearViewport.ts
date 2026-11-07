// Whether a block has come near the viewport. What is expensive to draw (a
// highlighted code block, a diagram) waits for that: a conversation is
// mounted whole, and drawing all of it before the first frame is what makes
// a long one slow to open and slow to switch to.

import { useEffect, useRef, useState } from 'react'

/** near turns true the first time the element comes within margin of the
 * viewport, and stays true: what was drawn once keeps what it drew, so
 * scrolling away and back draws nothing again. */
export function useNearViewport<T extends Element>(margin = '800px') {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || near) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setNear(true)
        observer.disconnect()
      },
      { rootMargin: margin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near, margin])
  return { ref, near }
}
