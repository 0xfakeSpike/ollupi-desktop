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

/** The path relative to root that a link or image in a workspace file
 * names, resolved as a browser would against the file's folder: the query
 * and fragment dropped, escapes decoded, . and .. walked; an absolute path
 * counts only under root. Undefined for a URL, a fragment alone, or a path
 * that climbs out of the root. */
export function linkedPath(ref: string, folder: string, root: string): string | undefined {
  let path = ref.trim().replace(/[?#].*$/s, '')
  if (!path || /^[a-z][\w+.-]*:/i.test(path) || path.startsWith('//')) return undefined
  try {
    path = decodeURIComponent(path)
  } catch {
    // A stray % is taken as it is.
  }
  let from = folder
  if (path.startsWith('/')) {
    const base = root.endsWith('/') ? root : `${root}/`
    if (!path.startsWith(base)) return undefined
    path = path.slice(base.length)
    from = ''
  }
  const parts = from ? from.split('/') : []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part !== '..') parts.push(part)
    else if (!parts.pop()) return undefined
  }
  return parts.length ? parts.join('/') : undefined
}
