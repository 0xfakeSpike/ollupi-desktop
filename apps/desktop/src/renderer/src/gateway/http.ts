// The gateway's plain HTTP paths and its terminal streams, beside its
// WebSocket: at the backend's address, with its token, as the WebSocket is
// opened. Reaching them offline rejects, async, so that it is a failure to
// show and not a throw inside an Effect, which would take the window down.

import { Paths } from '@ollupi/protocol'
import { t } from '../i18n'
import { useConnection } from './connection'

type PathName = keyof typeof Paths

/** A gateway path with its {names} filled in, each escaped; a name ending
 * in ... is a slash-separated path, escaped name by name. */
export function gatewayPath(name: PathName, values: Record<string, string>): string {
  return Paths[name].replace(/\{(\w+)(\.\.\.)?\}/g, (_, key: string, rest: string | undefined) => {
    const value = values[key] ?? ''
    return rest ? value.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value)
  })
}

function backend(): { url: string; token: string } {
  const b = useConnection.getState().backend
  if (b.status !== 'ready') throw new Error(t().errors.notConnected)
  return b
}

/** Fetches a gateway path; a response that is not ok rejects with what the
 * gateway said. */
export async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, token } = backend()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(new URL(path, url.replace(/^ws/, 'http')), { ...init, headers })
  if (!res.ok) throw new Error((await res.text().catch(() => '')).trim() || `${res.status} ${res.statusText}`)
  return res
}

/** Opens a WebSocket to a gateway path, with the token as the main
 * connection offers it: a WebSocket in a page sets no header of its own. */
export async function gatewaySocket(path: string): Promise<WebSocket> {
  const { url, token } = backend()
  return new WebSocket(new URL(path, url), ['ollupi.token', token])
}
