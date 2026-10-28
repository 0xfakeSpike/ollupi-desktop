// What runs inside the browser's page, in an isolated world of its own: the
// page's scripts cannot see or change it, and it sees the page's DOM. A
// snapshot gives each element a person can act on a ref, kept in that
// world until the next snapshot, and the agent acts on an element by its ref.

/** The isolated world the agent's scripts run in. */
export const WORLD = 1001

/** The page as text: the elements in document order, each interactive one
 * with its ref. Reads only what is shown. */
export const snapshotScript = (limit: number) => `(() => {
  const refs = new Map()
  window.__ollupiRefs = refs
  const lines = []
  let size = 0
  let cut = false
  const interactive = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[contenteditable=""],[contenteditable=true],' +
    '[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=textbox],[role=searchbox]'
  const clean = (s, n = 100) => {
    s = (s || '').replace(/\\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  const shown = (el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    const st = getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0 || st.display === 'contents'
  }
  const roleOf = (el) => {
    const role = el.getAttribute('role')
    if (role) return role
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'summary') return 'button'
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase()
      if (['button', 'submit', 'reset', 'image'].includes(t)) return 'button'
      if (t === 'checkbox' || t === 'radio') return t
      return t === 'search' ? 'searchbox' : 'textbox'
    }
    if (el.isContentEditable) return 'textbox'
    return tag
  }
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby')
    const labelled = by && by.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ')
    const label = el.labels && el.labels[0] ? el.labels[0].innerText : ''
    return clean(el.getAttribute('aria-label') || labelled || label || (el.tagName === 'INPUT' ? '' : el.innerText) ||
      el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || el.value || '')
  }
  const emit = (line) => {
    if (cut) return
    if (size + line.length > ${limit}) { cut = true; return }
    lines.push(line)
    size += line.length + 1
  }
  const walk = (el, depth) => {
    if (cut || !shown(el)) return
    const pad = '  '.repeat(Math.min(depth, 12))
    if (el.matches(interactive)) {
      const ref = 'e' + (refs.size + 1)
      refs.set(ref, el)
      let line = pad + '- ' + roleOf(el) + ' "' + nameOf(el) + '" [ref=' + ref + ']'
      if (el.tagName === 'A') line += ' -> ' + clean(el.getAttribute('href'), 80)
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'password' && el.value && roleOf(el) === 'textbox') line += ' value="' + clean(el.value, 80) + '"'
      if (el.type === 'password' && el.value) line += ' value=(hidden)'
      if (el.checked) line += ' checked'
      if (el.disabled) line += ' disabled'
      if (el.tagName === 'SELECT') line += ' value="' + clean(el.selectedOptions[0]?.text || '', 60) + '"'
      emit(line)
      return
    }
    const tag = el.tagName.toUpperCase()
    if (/^H[1-6]$/.test(tag)) {
      emit(pad + '- heading "' + clean(el.innerText, 160) + '" [level=' + tag[1] + ']')
      return
    }
    if (tag === 'IMG') {
      const alt = clean(el.getAttribute('alt'))
      if (alt) emit(pad + '- img "' + alt + '"')
      return
    }
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME'].includes(tag)) return
    const text = clean(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '), 300)
    if (text) emit(pad + '- text "' + text + '"')
    for (const child of el.children) walk(child, text ? depth + 1 : depth)
    if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child, depth)
  }
  window.__ollupiRole = roleOf
  window.__ollupiName = nameOf
  if (document.body) walk(document.body, 0)
  if (cut) lines.push('[the page goes on; scroll and take another snapshot to read more]')
  return lines.join('\\n')
})()`

/** The element a ref names, scrolled into view: its centre in the view's
 * coordinates, or why it cannot be found. */
export const locateScript = (ref: string) => `(() => {
  const el = window.__ollupiRefs?.get(${JSON.stringify(ref)})
  if (!el || !el.isConnected) return { error: 'no element ${ref} on the page now; take a new snapshot' }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`

/** Clicks the element in the DOM, for when the view is not on screen and
 * takes no input events. */
export const clickScript = (ref: string) => `(() => {
  const el = window.__ollupiRefs?.get(${JSON.stringify(ref)})
  if (!el || !el.isConnected) return { error: 'no element ${ref} on the page now; take a new snapshot' }
  el.click()
  return {}
})()`

/** Focuses a field and selects what it holds, so the text typed next
 * replaces it. */
export const focusScript = (ref: string) => `(() => {
  const el = window.__ollupiRefs?.get(${JSON.stringify(ref)})
  if (!el || !el.isConnected) return { error: 'no element ${ref} on the page now; take a new snapshot' }
  el.scrollIntoView({ block: 'center' })
  el.focus()
  if (typeof el.select === 'function') el.select()
  else if (el.isContentEditable) document.execCommand('selectAll')
  return document.activeElement === el || el.contains(document.activeElement) ? {} : { error: '${ref} cannot take text' }
})()`

export const scrollScript = (down: boolean) => `window.scrollBy(0, ${down ? '' : '-'}Math.round(window.innerHeight * 0.8))`

/** What an element is, as a person would name it, for the description of
 * an action on it. */
export const describeScript = (ref: string) => `(() => {
  const el = window.__ollupiRefs?.get(${JSON.stringify(ref)})
  if (!el || !el.isConnected) return { error: 'no element ${ref} on the page now; take a new snapshot' }
  return { role: window.__ollupiRole(el), name: window.__ollupiName(el) }
})()`
