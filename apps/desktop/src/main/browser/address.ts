// Addresses typed into the app's browser, by the person or the agent.

/** The page the browser starts at: a new tab opens it, as does the browser
 * opened with no tab. */
export const START_PAGE = 'https://www.google.com/'

/** Only web pages open, whoever asks: the main process can load what a page
 * itself may not, such as file:. */
export function isWebPage(url: string): boolean {
  return /^https?:/i.test(url)
}

/** An address as typed: without a scheme, a local server's is http and
 * anything else https. Only web pages open. */
export function normalize(url: string): string {
  const typed = url.trim()
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(typed)
  const withScheme = typed.includes('://') ? typed : `${local ? 'http' : 'https'}://${typed}`
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`only http and https pages open, not ${parsed.protocol}`)
  return parsed.toString()
}

/** What the person typed into the address bar, as the page it opens: an
 * address opens as one, and anything else is searched for on Google, as a
 * browser's address bar does. */
export function typedPage(typed: string): string {
  const text = typed.trim()
  return isAddress(text) ? normalize(text) : `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

/** Whether what is typed names a page rather than words to search for: it
 * has a scheme, or, without spaces, its host is a local server, an IP
 * address, a host with a port, or a name with a dot before a top-level
 * domain of letters, such as example.com. */
function isAddress(text: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true
  if (!text || /\s/.test(text)) return false
  const site = text.split(/[/?#]/)[0]!
  const [, host = '', port] = /^(\[[^\]]*\]|[^:@]*)(?::(\d+))?$/.exec(site) ?? []
  if (!host) return false
  if (port !== undefined) return true
  if (/^localhost$/i.test(host) || /^\[[0-9a-f:.]+\]$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  const labels = host.split('.')
  return labels.length > 1 && labels.every(Boolean) && /^(\p{L}{2,}|xn--[a-z0-9-]+)$/iu.test(labels.at(-1)!)
}
