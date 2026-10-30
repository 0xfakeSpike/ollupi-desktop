// Bringing what a search found into view and marking it for a moment
// (styles.css .found), on whichever screen lists it.

import { useEffect } from 'react'

export function markFound(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement)) return
  el.scrollIntoView({ block: 'center' })
  el.classList.add('found')
  el.addEventListener('animationend', () => el.classList.remove('found'), { once: true })
}

/** Marks the element whose data-found-id is id once the list showing it is
 * ready. */
export function useFound(id: string | undefined, ready: boolean): void {
  useEffect(() => {
    if (!id || !ready) return
    // After the frame that lays the list out.
    const frame = requestAnimationFrame(() => markFound(document.querySelector(`[data-found-id="${CSS.escape(id)}"]`)))
    return () => cancelAnimationFrame(frame)
  }, [id, ready])
}
