// Paths into a workspace as a reply names them. ollupi's tools show a path
// inside the project relative to its root and one outside it absolute; the
// model writes them back the same way, often as inline code, sometimes with
// a line after a colon.

/** The path relative to root that text names: relative already, or
 * absolute under root, with a leading ./ and a trailing :line(:column)
 * dropped. Undefined for text that is not a path into the workspace: a
 * URL, a home-relative or outside path, or a bare word, which is code more
 * often than a file. Whether the file is there is for the caller to ask. */
export function workspacePath(text: string, root: string): string | undefined {
  let path = text.trim()
  if (!path || path.length > 1024 || /[\n<>|"*?`{}$]/.test(path) || /^[a-z][\w+.-]*:/i.test(path)) return undefined
  path = path.replace(/:\d+(?::\d+)?$/, '').replace(/^(?:\.\/)+/, '')
  if (path.startsWith('/')) {
    const base = root.endsWith('/') ? root : `${root}/`
    if (!path.startsWith(base)) return undefined
    path = path.slice(base.length)
  }
  path = path.replace(/\/+$/, '')
  if (!path || path.startsWith('~')) return undefined
  return path.includes('/') || /\.[^./\s]+$/.test(path) ? path : undefined
}
