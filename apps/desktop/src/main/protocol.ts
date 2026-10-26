// Packaged builds serve the renderer from app://ollupi instead of file://, so
// the page has a real origin the gateway can allow and a strict CSP.

import { net, protocol } from 'electron'
import { join, normalize, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_HOST, APP_SCHEME } from '../shared/ipc'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  'connect-src ws://127.0.0.1:*',
].join('; ')

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export function serveRenderer(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('not found', { status: 404 })
    const file = normalize(join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)))
    if (relative(root, file).startsWith('..')) return new Response('forbidden', { status: 403 })
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
}

export const rendererURL = `${APP_SCHEME}://${APP_HOST}/index.html`
