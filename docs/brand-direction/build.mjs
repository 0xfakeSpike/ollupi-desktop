// Builds index.html: every board listed in canvas.json in one file that opens
// in a browser straight from disk. The .dc.html sources are
// inlined and drawn by the small runtime below, which covers what these
// boards use: {{holes}}, <sc-for>, <sc-if>, <dc-import>, <helmet> and a
// DCLogic class with state, setState and mount/unmount.
//
//   node docs/brand-direction/build.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const canvas = JSON.parse(readFileSync(join(here, 'canvas.json'), 'utf8'))
const sources = Object.fromEntries(canvas.order.map((file) => [file, readFileSync(join(here, file), 'utf8')]))
const boards = canvas.order.map((file) => ({ file, ...canvas.boards[file] }))
const data = JSON.stringify({ title: canvas.title, boards, sources }).replace(/</g, '\\u003c')

const runtime = String.raw`
const { title, boards, sources } = JSON.parse(document.getElementById('canvas').textContent)
const SVG = 'http://www.w3.org/2000/svg'
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g
const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/

class DCLogic {
  constructor() { this.props = {}; this.state = {} }
  setState(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state, this.props) : patch) }
    this.__inst && this.__inst.render()
  }
  forceUpdate() { this.__inst && this.__inst.render() }
}

const helmets = new Set()
const defs = {}
function define(file) {
  if (defs[file]) return defs[file]
  const doc = new DOMParser().parseFromString(sources[file], 'text/html')
  const xdc = doc.querySelector('x-dc')
  const helmet = xdc.querySelector('helmet')
  if (helmet) helmet.remove()
  const script = doc.querySelector('script[data-dc-script]')
  const Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic)
  return (defs[file] = { file, template: [...xdc.childNodes], helmet, Component })
}

// A board's <helmet>: its font links once each, its styles scoped to it
// (body rules dropped, link colours kept to the board).
function addHelmet(def) {
  if (!def.helmet || helmets.has(def.file)) return
  helmets.add(def.file)
  for (const el of def.helmet.children) {
    if (el.tagName === 'LINK') {
      if (![...document.head.querySelectorAll('link')].some((l) => l.href === el.href)) document.head.append(el.cloneNode())
    } else if (el.tagName === 'STYLE') {
      const css = el.textContent
        .replace(/body\s*\{[^}]*\}/g, '')
        .replace(/(^|\})\s*a(:hover)?\s*\{/g, (_, b, h) => b + '[data-board="' + def.file + '"] a' + (h || '') + '{')
      const style = document.createElement('style')
      style.textContent = css
      document.head.append(style)
    }
  }
}

function lookup(scope, path) {
  if (/^-?\d/.test(path)) return Number(path)
  if (path === 'true') return true
  if (path === 'false') return false
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), scope)
}
const interpolate = (text, scope) => text.replace(HOLE, (_, p) => { const v = lookup(scope, p); return v == null ? '' : String(v) })
const raw = (text, scope) => { const m = WHOLE.exec(text); return m ? lookup(scope, m[1]) : interpolate(text, scope) }
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

function renderNodes(nodes, scope, ctx, svg) {
  const frag = document.createDocumentFragment()
  for (const node of nodes) {
    if (node.nodeType === 3) { frag.append(interpolate(node.textContent, scope)); continue }
    if (node.nodeType !== 1) continue
    const tag = node.tagName.toLowerCase()
    if (tag === 'sc-for') {
      const list = raw(node.getAttribute('list') || '', scope) || []
      const as = node.getAttribute('as') || 'item'
      list.forEach((item, i) => frag.append(renderNodes(node.childNodes, { ...scope, [as]: item, $index: i }, ctx, svg)))
      continue
    }
    if (tag === 'sc-if') {
      if (raw(node.getAttribute('value') || '', scope)) frag.append(renderNodes(node.childNodes, scope, ctx, svg))
      continue
    }
    if (tag === 'dc-import') {
      const props = {}
      for (const a of node.attributes) if (a.name !== 'name' && !a.name.startsWith('hint-')) props[camel(a.name)] = raw(a.value, scope)
      frag.append(ctx.child(node.getAttribute('name') + '.dc.html', props))
      continue
    }
    const inSvg = svg || tag === 'svg'
    const el = inSvg ? document.createElementNS(SVG, node.tagName) : document.createElement(tag)
    for (const a of node.attributes) {
      const v = raw(a.value, scope)
      if (/^on[A-Z]/.test(a.name) || (/^on/.test(a.name) && typeof v === 'function')) el.addEventListener(a.name.slice(2).toLowerCase(), v)
      else el.setAttribute(a.name, v == null ? '' : String(v))
    }
    el.append(renderNodes(node.childNodes, scope, ctx, inSvg))
    frag.append(el)
  }
  return frag
}

class Instance {
  constructor(file, props) {
    this.def = define(file)
    addHelmet(this.def)
    this.root = document.createElement('div')
    this.root.style.display = 'contents'
    this.root.dataset.board = file
    this.logic = new this.def.Component()
    this.logic.props = props
    this.logic.__inst = this
    this.children = new Map()
  }
  render() {
    const vals = this.logic.renderVals ? this.logic.renderVals() : {}
    let n = 0
    const ctx = {
      child: (file, props) => {
        const key = file + '#' + n++
        let c = this.children.get(key)
        if (c) { c.logic.props = props; c.render() }
        else { c = new Instance(file, props); this.children.set(key, c); c.render(); c.logic.componentDidMount && c.logic.componentDidMount() }
        return c.root
      },
    }
    this.root.replaceChildren(renderNodes(this.def.template, vals, ctx, false))
  }
}

document.title = title
document.getElementById('title').textContent = title
const nav = document.getElementById('nav')
const main = document.getElementById('boards')
const frames = []
for (const b of boards) {
  const id = b.file.replace('.dc.html', '')
  const link = document.createElement('a')
  link.href = '#' + id
  link.textContent = b.title || id
  nav.append(link)

  const section = document.createElement('section')
  section.id = id
  const h = document.createElement('h2')
  h.textContent = b.title || id
  const frame = document.createElement('div')
  frame.className = 'frame'
  const stage = document.createElement('div')
  stage.className = 'stage'
  stage.style.width = b.w + 'px'
  stage.style.height = b.h + 'px'
  const inst = new Instance(b.file, {})
  inst.render()
  stage.append(inst.root)
  inst.logic.componentDidMount && inst.logic.componentDidMount()
  frame.append(stage)
  section.append(h, frame)
  main.append(section)
  frames.push({ b, frame, stage })
}

function fit() {
  const room = main.clientWidth
  for (const { b, frame, stage } of frames) {
    const s = Math.min(1, room / b.w)
    stage.style.transform = 'scale(' + s + ')'
    frame.style.width = b.w * s + 'px'
    frame.style.height = b.h * s + 'px'
  }
}
fit()
addEventListener('resize', fit)
`

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ollupi 设计语言方向稿</title>
<!-- Generated by build.mjs from the .dc.html boards and canvas.json; edit those, then run: node docs/brand-direction/build.mjs -->
<style>
body { margin: 0; background: #e8e8ee; color: #17161f; font-family: Inter, 'PingFang SC', -apple-system, sans-serif; }
header { position: sticky; top: 0; z-index: 10; background: rgba(245,245,248,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(27,24,56,0.08); padding: 12px 32px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
header h1 { margin: 0 12px 0 0; font-size: 15px; font-weight: 600; color: #1b1838; }
nav { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; }
nav a { color: #52515f; text-decoration: none; }
nav a:hover { color: #1b1838; }
#boards { max-width: 1440px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 48px; }
section { scroll-margin-top: 72px; }
section h2 { margin: 0 0 12px; font-size: 13px; font-weight: 500; color: #52515f; }
.frame { overflow: hidden; border-radius: 8px; box-shadow: 0 1px 2px rgba(27,24,56,0.06), 0 8px 24px rgba(27,24,56,0.08); background: #fff; }
.stage { transform-origin: top left; }
</style>
</head>
<body>
<header><h1 id="title"></h1><nav id="nav"></nav></header>
<main id="boards"></main>
<script type="application/json" id="canvas">${data}</script>
<script>${runtime}</script>
</body>
</html>
`

writeFileSync(join(here, 'index.html'), html)
console.log('wrote', join(here, 'index.html'))
