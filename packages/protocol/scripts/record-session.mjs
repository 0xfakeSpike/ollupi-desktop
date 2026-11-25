// Records real gateway traffic into fixtures/session.json for the contract
// tests. It builds the sidecar against the current ollupi, starts it with
// the scripted mock model on a throwaway home, and drives one session that
// exercises every message kind the UI handles: streaming, an approval, a
// question, a plan, a scheduled task created by the model, a subagent, an
// MCP tool call (mock-mcp.mjs, beside a server that cannot start), the
// memory snapshot and a memory_search call, the skill methods with
// skill/changed and an invalid skill refused, a file attached by path,
// read_file alone and with glob and grep in one answer, messages sent while
// a turn runs (each a turn behind it), the cron, workspace, memory,
// settings, MCP, permission and hub methods, token usage grouped each way,
// presence stretches and their totals, and an error response. Server requests
// are answered as a user would (approve, pick the first option). Every JSON-RPC
// message is kept raw, in order, with its direction.
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
const OPERATOR = 'record-operator'
/** The operator's secret and the profile the one recorded session acts as,
 * as the app connects: every connection is named by a profile, and the
 * operator's also sets the catalog of models. */
const CONNECTION = `${OPERATOR}.default`

const children = []
process.on('exit', () => {
  for (const c of children) c.kill('SIGTERM')
  rmSync(tmp, { recursive: true, force: true })
})

const binary = join(tmp, 'ollupid')
execFileSync('go', ['build', '-tags', 'sqlite_fts5', '-o', binary, './cmd/ollupid'], { cwd: sidecar, stdio: 'inherit' })
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
`,
)

children.push(spawn('node', [join(here, 'mock-model.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' }))
const backend = spawn(binary, ['--home', home], { env: { ...process.env, OLLUPI_GATEWAY_TOKEN: TOKEN, OLLUPI_OPERATOR_TOKEN: OPERATOR }, stdio: ['ignore', 'pipe', 'inherit'] })
children.push(backend)
const url = await new Promise((resolve, reject) => {
  createInterface({ input: backend.stdout }).once('line', (line) => {
    const msg = JSON.parse(line)
    msg.type === 'ready' ? resolve(msg.url) : reject(new Error(msg.message))
  })
})

// --- a minimal JSON-RPC client that records everything ---

const messages = []
const ws = new WebSocket(url, ['ollupi.token', CONNECTION])
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

const endedStatus = (m) => m.method === 'turn/changed' && ['completed', 'failed', 'interrupted'].includes(m.params.turn.status)
// Every turn that has ended, for a wait that may begin after it did.
const ended = new Set()
listeners.add((m) => endedStatus(m) && ended.add(m.params.turn.id))
// Each turn's first message, as item/changed told of it.
const firstMessages = new Map()
listeners.add((m) => {
  const item = m.method === 'item/changed' && m.params.item
  if (item?.type === 'userMessage' && !firstMessages.has(item.turnId)) firstMessages.set(item.turnId, item)
})

/** Resolves when the turn ends (turn/changed to an ending). */
const completed = (turnId) =>
  new Promise((resolve) => {
    if (ended.has(turnId)) return resolve()
    const l = (m) => {
      if (endedStatus(m) && m.params.turn.id === turnId) {
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
await call('catalog/read', {})
await call('catalog/set', {
  data: [{ id: 'mock', api: 'openai', baseUrl: `http://127.0.0.1:${PORT}/v1`, apiKey: 'test', models: [{ name: 'mock-model', limits: { context: 128000, output: 8000 } }] }],
})
await call('catalog/set', { data: [{ id: 'a/b', api: 'openai', models: [{ name: 'x', limits: { context: 1000, output: 100 } }] }] }).catch(() => {})
await call('model/list', {})
await call('settings/read', {})
// The user's MCP servers, one that cannot start beside it; each arrives as
// mcpServer/changed.
await call('mcpServer/set', { name: 'mock', command: 'node', args: [join(here, 'mock-mcp.mjs')] })
await call('mcpServer/set', { name: 'broken', command: 'ollupi-no-such-mcp-command' })
await call('tool/list', {})
await call('mcpServer/list', {})
await call('settings/updatePermissions', { approvalPolicy: 'on-request', permissions: {} })
// broken does not connect, so a rule naming its tool cannot be checked: refused.
await call('settings/updatePermissions', { approvalPolicy: 'on-request', permissions: { deny: ['broken__delete_everything'] } }).catch(() => {})
await call('settings/update', { memory: true })
await call('settings/update', { model: 'mock/mock-model' })
const { workspace: ws1 } = await call('workspace/add', { path: workspace })
await call('workspace/rename', { workspaceId: ws1.id, name: 'Demo' })
await call('workspace/list', {})
const { thread } = await call('thread/start', { workspaceId: ws1.id })

await turn(thread.id, 'Hello there\nsecond line')
// A file goes by its path; ollupi copies it into the thread's attachments.
const notes = join(tmp, 'notes.txt')
writeFileSync(notes, 'indent with two spaces\n')
const attached = await call('turn/start', { threadId: thread.id, input: [{ type: 'text', text: 'read the attached notes' }, { type: 'file', path: notes }] })
await completed(attached.turn.id)
await turn(thread.id, 'run ls please')
await turn(thread.id, 'please ask me which language')
await turn(thread.id, 'make a plan')
await turn(thread.id, 'please schedule a morning brief')
await turn(thread.id, 'check the weather with a subagent')
await turn(thread.id, 'use the mcp echo tool')
await turn(thread.id, 'search memory for my indentation style')
await turn(thread.id, 'read readme')
await turn(thread.id, 'look around the project')

// Three messages at once: the second and third each wait in a turn behind
// the one before.
const three = []
for (const text of ['first of three', 'second of three', 'third of three']) three.push(await call('turn/start', { threadId: thread.id, input: [{ type: 'text', text }] }))
for (const { turn } of three) await completed(turn.id)

await call('cron/list', { threadId: thread.id })
await call('cron/list', {})
await call('cron/create', { threadId: thread.id, name: 'hourly-check', spec: '@hourly', prompt: 'Anything new?', times: 3 })
await call('cron/pause', { threadId: thread.id, name: 'hourly-check', paused: true })
await call('cron/delete', { threadId: thread.id, name: 'hourly-check' })
// Each change above arrives as cron/changed, the deletion with a null job.
await call('thread/updatePermissions', { threadId: thread.id, approvalPolicy: 'never', permissions: { deny: ['run_command(rm:*)'] } })
await call('workspace/updatePermissions', { workspaceId: ws1.id, permissions: { ask: ['run_command'] } })
// A new rule for a server that did not connect cannot be checked: refused.
await call('workspace/updatePermissions', { workspaceId: ws1.id, permissions: { ask: ['run_command', 'broken__new_tool'] } }).catch(() => {})
await call('skill/list', {})
await call('skill/set', {
  name: 'release-notes',
  description: 'Writes release notes from the changes since the last tag.',
  version: '1',
  instructions: 'Read the log, then write the notes.',
  roles: ['full-main-agent', 'compact-main-agent'],
  files: [{ path: 'scripts/log.sh', text: 'git log --oneline\n', executable: true }],
})
await call('skill/read', { name: 'release-notes' })
await call('skill/set', { name: 'Not A Name', description: 'x', instructions: 'x', roles: ['full-main-agent'] }).catch(() => {})
await call('skill/delete', { name: 'release-notes' })
await call('memory/status', {})
await call('memory/list', { scope: 'global' })
await call('memory/list', { scope: 'general' })
// The Super Agent: a hub workspace with instructions.
const hubFolder = join(tmp, 'super-agent')
mkdirSync(hubFolder, { recursive: true })
const { workspace: hub } = await call('workspace/add', { path: hubFolder, name: 'Super Agent' })
await call('workspace/setKind', { workspaceId: hub.id, kind: 'hub' })
await call('workspace/updateInstructions', { workspaceId: hub.id, instructions: 'Hand docs work to Demo.' })
await call('memory/list', { scope: 'workspace', workspaceId: ws1.id })
// The workspace scope needs its workspace: refused.
await call('memory/list', { scope: 'workspace' }).catch(() => {})
await call('memory/move', { id: 'no-such-memory' }).catch(() => {})
// Each switch arrives as settings/changed; it ends on, as it starts.
await call('settings/update', { redaction: false })
await call('settings/update', { redaction: true })
await call('thread/list', { limit: 100 })
// The workspace's folder moves to another one, which has to be empty; the
// threads hang off its id, so they stay its own.
const moved = join(tmp, 'moved')
mkdirSync(moved)
await call('workspace/move', { workspaceId: ws1.id, path: moved })
await call('thread/list', { workspaceId: ws1.id, limit: 100 })
await call('thread/read', { threadId: thread.id, limit: 500 })
await call('thread/read', { threadId: 'no-such-thread' }).catch(() => {})
await call('mcpServer/delete', { name: 'broken' })
// Token use over the last day and tomorrow, grouped each way the usage page
// reads it.
const usageFrom = new Date(Date.now() - 86_400_000).toISOString()
const usageTo = new Date(Date.now() + 86_400_000).toISOString()
for (const groupBy of ['day', 'workspace', 'provider', 'connection', 'model']) await call('usage/query', { from: usageFrom, to: usageTo, groupBy, offsetMinutes: 0 })
// Time the desktop counted with a thread on screen: a stretch written, then the
// thread totals it lands in.
await call('presence/record', {
  rows: [
    {
      id: '6b1f0a1e-0000-4000-8000-000000000001',
      threadId: thread.id,
      workspaceId: ws1.id,
      state: 'seen',
      start: new Date(Date.now() - 120_000).toISOString(),
      end: new Date(Date.now() - 60_000).toISOString(),
    },
  ],
})
await call('presence/summary', { from: usageFrom, to: usageTo, groupBy: 'thread', offsetMinutes: 0 })

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
