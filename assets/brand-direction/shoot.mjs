// Saves every board in index.html as a PNG under images/, at 1:1 board size
// and 2x pixel density. Run build.mjs first so index.html is current. Uses the
// installed Google Chrome (override with CHROME=/path/to/chrome) and needs the
// network for the Google Fonts the boards load.
//
// Animated boards are frozen on their first frame, so the images only change
// when a board does.
//
//   node assets/brand-direction/shoot.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const canvas = JSON.parse(readFileSync(join(here, 'canvas.json'), 'utf8'))
const out = join(here, 'images')
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const scale = 2

const profile = mkdtempSync(join(tmpdir(), 'brand-shoot-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--disable-gpu', '--force-color-profile=srgb', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })

try {
  const wsUrl = await new Promise((resolve, reject) => {
    let err = ''
    proc.stderr.on('data', (d) => {
      err += d
      const m = /DevTools listening on (ws:\S+)/.exec(err)
      if (m) resolve(m[1])
    })
    proc.on('exit', (code) => reject(new Error(`Chrome exited (${code}): ${err}`)))
  })

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  const waiters = []
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method) {
      for (const w of waiters.splice(0)) if (w.method === msg.method) w.resolve(msg.params); else waiters.push(w)
    }
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }))

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params) => send(method, params, sessionId)
  const evaluate = async (expression) => (await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value

  await page('Page.enable')
  // Wide enough that fit() leaves every board at scale 1.
  await page('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: scale, mobile: false })
  // Freeze the Pup and Pixels timers on tick 0.
  await page('Page.addScriptToEvaluateOnNewDocument', { source: 'window.setInterval = () => 0' })
  const loaded = once('Page.loadEventFired')
  await page('Page.navigate', { url: pathToFileURL(join(here, 'index.html')).href })
  await loaded
  await evaluate('document.fonts.ready.then(() => document.fonts.status)')
  // The sticky jump bar would sit over the top of each board.
  await evaluate(`document.getElementById('top').style.display = 'none'`)

  mkdirSync(out, { recursive: true })
  for (const [i, file] of canvas.order.entries()) {
    const board = file.replace('.dc.html', '')
    const rect = await evaluate(`(() => {
      const s = document.querySelector('#${board} .stage')
      s.scrollIntoView()
      return document.fonts.ready
        .then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
        .then(() => s.getBoundingClientRect())
    })().then((r) => {
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
    })`)
    const { w, h } = canvas.boards[file]
    if (Math.round(rect.width) !== w || Math.round(rect.height) !== h) throw new Error(`${file} drew at ${rect.width}×${rect.height}, expected ${w}×${h}`)
    const { data } = await page('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 }, captureBeyondViewport: true })
    const name = `${String(i + 1).padStart(2, '0')}-${board}.png`
    writeFileSync(join(out, name), Buffer.from(data, 'base64'))
    console.log('wrote', join(out, name))
  }
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  await send('Browser.close').catch(() => {})
  await exited
  ws.close()
} finally {
  if (proc.exitCode === null) {
    const exited = new Promise((resolve) => proc.once('exit', resolve))
    proc.kill()
    await exited
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 10 })
}
