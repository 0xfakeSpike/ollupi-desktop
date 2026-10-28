// Addresses typed into the app's browser, by the person or the agent.

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
