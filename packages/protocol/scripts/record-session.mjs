// Records real gateway traffic into fixtures/session.json for the contract
// tests. It builds the sidecar against the current ollupi, starts it with
// the scripted mock model on a throwaway home, and drives one session that
// exercises every message kind the UI handles: streaming, an approval, a
// question, a plan, a scheduled task created by the model, a subagent, an
// MCP tool call (mock-mcp.mjs, beside a server that cannot start), the
// memory snapshot and a memory_search call, a file attached by path,
// read_file alone and with glob and grep in one answer, queued turns, the
// cron, workspace, memory, settings, MCP and permission methods,
// and an error response. Server requests are answered as a user would (approve,
// pick the first option). Every JSON-RPC message is kept raw, in order,
// with its direction.
//
//   node scripts/record-session.mjs   (re-run after ollupi changes the contract)

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sidecar = join(here, '../../../sidecar')
const out = join(here, '../fixtures/session.json')
const tmp = mkdtempSync(join(tmpdir(), 'ollupi-record-'))
const PORT = 18000 + Math.floor(Math.random() * 1000)
const TOKEN = 'record'

const children = []
process.on('exit', () => {
  for (const c of children) c.kill('SIGTERM')
  rmSync(tmp, { recursive: true, force: true })
})

const binary = join(tmp, 'ollupid')
execFileSync('go', ['build', '-o', binary, './cmd/ollupid'], { cwd: sidecar, stdio: 'inherit' })
// The ollupi module the sidecar requires, from Go's module cache: its
// version names it.
const [ollupi, revision] = execFileSync('go', ['list', '-m', '-f', '{{.Dir}}\n{{.Version}}', 'github.com/0xfakeSpike/ollupi'], { cwd: sidecar, encoding: 'utf8' })
  .trim()
  .split('\n')
const contract = readFileSync(join(ollupi, 'gateway/protocol.schema.json'))

const home = join(tmp, 'home')
const workspace = join(tmp, 'workspace')
mkdirSync(home)
mkdirSync(workspace)
writeFileSync(join(workspace, 'README.md'), '# demo\n')
writeFileSync(
  join(home, 'config.yaml'),
  `name: ollupi
models:
  - provider: mock
    type: openai
    base_url: http://127.0.0.1:${PORT}/v1
    api_key: test
    names:
      - name: mock-model
        limits: { context: 128000, output: 8000 }
permissions:
  approval: on-request
  # broken does not connect: the rule is kept and matches nothing.
  deny: [broken__delete_everything]
workspace:
  enabled: true
  sandbox_mode: workspace-write
mcp:
  - name: mock
    command: node
    args: [${JSON.stringify(join(here, 'mock-mcp.mjs'))}]
  - name: broken
    command: ollupi-no-such-mcp-command
memory:
  use: true
  generate: false
`,
)

children.push(spawn('node', [join(here, 'mock-model.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' }))
const backend = spawn(binary, ['--home', home], { env: { ...process.env, OLLUPI_GATEWAY_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'inherit'] })
children.push(backend)
const url = await new Promise((resolve, reject) => {
  createInterface({ input: backend.stdout }).once('line', (line) => {
    const msg = JSON.parse(line)
    msg.type === 'ready' ? resolve(msg.url) : reject(new Error(msg.message))
  })
})

// --- a minimal JSON-RPC client that records everything ---

const messages = []
const ws = new WebSocket(`${url}?token=${TOKEN}`)
await new Promise((r, e) => {
  ws.addEventListener('open', r)
  ws.addEventListener('error', e)
})
let nextId = 1
const waiting = new Map()
const listeners = new Set()
const send = (m) => {
  messages.push({ direction: 'out', message: m })
  ws.send(JSON.stringify(m))
}
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  messages.push({ direction: 'in', message: m })
  if (m.method && m.id !== undefined) return answer(m)
  if (m.method) return listeners.forEach((l) => l(m))
  const w = waiting.get(m.id)
  waiting.delete(m.id)
  m.error ? w.reject(Object.assign(new Error(m.error.message), { code: m.error.code })) : w.resolve(m.result)
})
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })

function answer(m) {
  if (m.method === 'item/toolCall/requestApproval') return send({ jsonrpc: '2.0', id: m.id, result: { decision: 'accept' } })
  const answers = Object.fromEntries(m.params.questions.map((q) => [q.id, { answers: [q.options?.[0]?.label ?? 'yes'] }]))
  send({ jsonrpc: '2.0', id: m.id, result: { answers } })
}

/** Resolves when the turn completes (turn/completed for it). */
const completed = (turnId) =>
  new Promise((resolve) => {
    const l = (m) => {
      if (m.method === 'turn/completed' && m.params.turn.id === turnId) {
        listeners.delete(l)
        resolve(m.params.turn)
      }
    }
    listeners.add(l)
  })

async function turn(threadId, text) {
  const { turn } = await call('turn/start', { threadId, input: [{ type: 'text', text }] })
  return completed(turn.id)
}

// --- the session ---

await call('initialize', { clientInfo: { name: 'record-session', version: '0' } })
send({ jsonrpc: '2.0', method: 'initialized', params: {} })
await call('model/list', {})
await call('tool/list', {})
await call('mcpServer/list', {})
const { workspace: ws1 } = await call('workspace/add', { path: workspace })
await call('workspace/rename', { workspaceId: ws1.id, name: 'Demo' })
await call('workspace/list', {})
const { thread } = await call('thread/start', { workspaceId: ws1.id, permissions: {} })

await turn(thread.id, 'Hello there\nsecond line')
// A file goes by its path; ollupi copies it into the thread's attachments.
const notes = join(tmp, 'notes.txt')
writeFileSync(notes, 'indent with two spaces\n')
const attached = await call('turn/start', { threadId: thread.id, input: [{ type: 'text', text: 'read the attached notes' }, { type: 'file', path: notes }] })
await completed(attached.turn.id)
await call('attachment/read', { threadId: thread.id, attachmentId: attached.turn.attachments[0].id })
await turn(thread.id, 'run ls please')
await turn(thread.id, 'please ask me which language')
await turn(thread.id, 'make a plan')
await turn(thread.id, 'please schedule a morning brief')
await turn(thread.id, 'delegate the weather check')
await turn(thread.id, 'use the mcp echo tool')
await turn(thread.id, 'search memory for my indentation style')
await turn(thread.id, 'read readme')
await turn(thread.id, 'look around the project')

// Two messages at once: the second waits as a queued turn.
const first = await call('turn/start', { threadId: thread.id, input: [{ type: 'text', text: 'first of two' }] })
const second = await call('turn/start', { threadId: thread.id, input: [{ type: 'text', text: 'second of two' }] })
await completed(first.turn.id)
await completed(second.turn.id)

await call('cron/list', { threadId: thread.id })
await call('cron/list', {})
await call('cron/create', { threadId: thread.id, name: 'hourly-check', spec: '@hourly', prompt: 'Anything new?' })
await call('cron/pause', { threadId: thread.id, name: 'hourly-check', paused: true })
await call('cron/delete', { threadId: thread.id, name: 'hourly-check' })
// Each change above arrives as cron/changed, the deletion with a null job.
await call('thread/updatePermissions', { threadId: thread.id, approvalPolicy: 'never', permissions: { deny: ['run_command(rm:*)'] } })
await call('workspace/updatePermissions', { workspaceId: ws1.id, permissions: { ask: ['run_command'] } })
// A new rule for a server that did not connect cannot be checked: refused.
await call('workspace/updatePermissions', { workspaceId: ws1.id, permissions: { ask: ['run_command', 'broken__new_tool'] } }).catch(() => {})
await call('memory/status', {})
await call('memory/list', { scope: 'global' })
await call('memory/list', { scope: 'general' })
await call('memory/list', { scope: 'workspace', workspaceId: ws1.id })
// The workspace scope needs its workspace: refused.
await call('memory/list', { scope: 'workspace' }).catch(() => {})
await call('memory/move', { id: 'no-such-memory' }).catch(() => {})
// Each switch arrives as settings/changed; it ends on, as it starts.
await call('settings/read', {})
await call('settings/update', { redaction: false })
await call('settings/update', { redaction: true })
await call('thread/list', { limit: 100 })
await call('thread/list', { workspaceId: ws1.id, limit: 100 })
await call('thread/read', { threadId: thread.id, limit: 500 })
await call('thread/read', { threadId: 'no-such-thread' }).catch(() => {})

ws.close()
writeFileSync(
  out,
  JSON.stringify(
    {
      recordedWith: { ollupi: revision, protocolSha256: createHash('sha256').update(contract).digest('hex') },
      threadId: thread.id,
      messages,
    },
    null,
    1,
  ) + '\n',
)
console.log(`recorded ${messages.length} messages to ${out}`)
process.exit(0)
