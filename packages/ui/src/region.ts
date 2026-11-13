// Where a floating layer may open. The window is divided into regions that
// each own their area: the screen's column, a side panel, the part of the
// browser panel above its page, a dialog. A menu or tooltip opens within the
// region its trigger is in, never across into another. The browser's page is
// drawn by the system above the whole interface, so no layer could show over
// it; the regions beside it are how layers keep out of it (DESIGN.md 3.7).

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** The nearest region around an element, marked data-region; the window
 * when there is none. */
export function regionOf(el: Element): Bounds {
  const region = el.closest('[data-region]')
  if (!region) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  const { left, top, right, bottom } = region.getBoundingClientRect()
  return { left, top, right, bottom }
}
