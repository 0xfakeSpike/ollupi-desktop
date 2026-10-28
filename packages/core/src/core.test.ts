import type { ItemRow, ThreadPageResult, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import {
  activeTurn,
  contextUse,
  latestContextCall,
  modelCalls,
  appendDelta,
  approvalCallOf,
  callOf,
  commandFailed,
  commandLine,
  groupByTurn,
  groupByWorkspace,
  promptMemory,
  prependPage,
  refreshFromPage,
  timelineFromPage,
  upsertItem,
  upsertThread,
  upsertTurn,
  waitsForAnswer,
  waitsForApproval,
  elapsed,
  span,
  cronSpec,
  scheduleOf,
  type Schedule,
} from './index'

const thread = (extra: Partial<ThreadRow> = {}): ThreadRow => ({
  id: 'th',
  preview: 'hello',
  settings: { permissions: {} },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const turn = (id: string, seq: number, status: TurnRow['status'] = 'completed'): TurnRow => ({
  id,
  threadId: 'th',
  seq,
  status,
  model: { name: 'm', connection: 'm' },
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  startedAt: '2026-01-01T00:00:00Z',
})

const item = (id: string, seq: number, extra: Partial<ItemRow> = {}): ItemRow => ({
  id,
  turnId: 'u1',
  seq,
  type: 'agentMessage',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const page = (items: ItemRow[], turns: TurnRow[], hasMore = false): ThreadPageResult => ({ thread: thread(), turns, items, hasMore })

describe('timeline', () => {
  it('sorts pages and merges an older page without duplicates', () => {
    const t = timelineFromPage(page([item('c', 3), item('b', 2)], [turn('u1', 1)], true))
    expect(t.items.map((i) => i.id)).toEqual(['b', 'c'])
    const merged = prependPage(t, page([item('a', 1), item('b', 2)], [turn('u1', 1)]))
    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(merged.hasMore).toBe(false)
  })

  it('streams deltas into a started item; completion replaces the text', () => {
    let t = timelineFromPage(page([], [turn('u1', 1, 'inProgress')]))
    t = upsertItem(t, item('m', 1, { status: 'inProgress', text: '' }))
    t = appendDelta(appendDelta(appendDelta(t, 'm', 'Hel'), 'm', 'lo'), 'unknown', 'x')
    expect(t.items[0]!.text).toBe('Hello')
    t = upsertItem(t, item('m', 1, { text: 'Hello!' }))
    expect(t.items.map((i) => i.text)).toEqual(['Hello!'])
  })

  it('follows the active turn through its status', () => {
    let t = upsertTurn(timelineFromPage(page([], [turn('u1', 1)])), turn('u2', 2, 'inProgress'))
    expect(activeTurn(t)?.id).toBe('u2')
    t = upsertTurn(t, turn('u2', 2))
    expect(activeTurn(t)).toBeUndefined()
  })

  it('keeps older loaded history when refreshing from the latest page', () => {
    const t = prependPage(timelineFromPage(page([item('c', 3)], [turn('u1', 1)], true)), page([item('b', 2)], [], true))
    const r = refreshFromPage(t, page([item('c', 3), item('d', 4)], [turn('u1', 1)], true))
    expect(r.items.map((i) => i.id)).toEqual(['b', 'c', 'd'])
  })

  it('groups items under turns; queued turns have no group', () => {
    const t = timelineFromPage(
      page([item('a', 1), item('b', 2, { turnId: 'u2' })], [turn('u1', 1), turn('u2', 2), turn('u3', 3, 'queued')]),
    )
    expect(groupByTurn(t).map((g) => [g.turn.id, g.items.length])).toEqual([
      ['u1', 1],
      ['u2', 1],
    ])
  })
})

describe('threads', () => {
  it('orders like thread/list: updatedAt, then createdAt, newest first', () => {
    let list = upsertThread([], thread({ id: 'a' }), 'active')
    list = upsertThread(list, thread({ id: 'b', createdAt: '2026-01-02T00:00:00Z' }))
    list = upsertThread(list, thread({ id: 'c', updatedAt: '2026-02-01T00:00:00Z' }))
    expect(list.map((t) => t.id)).toEqual(['c', 'b', 'a'])
    list = upsertThread(list, thread({ id: 'a', preview: 'renamed' }))
    expect(list.find((t) => t.id === 'a')).toMatchObject({ preview: 'renamed', status: 'active' })
  })

  it('keeps subagent threads out of the list', () => {
    expect(upsertThread([], thread({ id: 'child', parentThreadId: 'th' }))).toEqual([])
  })

  it('groups by active workspace with loose threads last', () => {
    const ws = { id: 'w', name: 'W', rootPath: '/w', settings: { permissions: {} }, createdAt: '', updatedAt: '' }
    const list = upsertThread(upsertThread([], thread({ workspaceId: 'w' })), thread({ id: 'loose' }))
    const groups = groupByWorkspace([ws, { ...ws, id: 'old', archivedAt: '2026-01-01T00:00:00Z' }], list)
    expect(groups.map((g) => [g.workspace?.id, g.threads.map((t) => t.id)])).toEqual([
      ['w', ['th']],
      [undefined, ['loose']],
    ])
  })
})

describe('calls', () => {
  const call = (extra: Partial<ItemRow>) => item('c', 1, { type: 'toolCall', status: 'pending', ...extra })
  const prepared = { cwd: '/w', settingsDigest: '', argumentsDigest: '', program: 'git', args: ['commit', '-m', "it's"] }

  it('reads the frozen command; before preparation it is any tool', () => {
    const c = call({ tool: 'run_command', arguments: JSON.stringify({ program: 'ls', args: ['-la'] }), preparedExecution: prepared })
    const read = callOf(c)
    expect(read.kind === 'command' && [commandLine(read.command), read.command.cwd]).toEqual([`git commit -m 'it'\\''s'`, '/w'])
    expect(callOf({ ...c, preparedExecution: undefined })).toEqual({ kind: 'tool', name: 'run_command', server: undefined })
  })

  it('reads command output only when it matches the contract', () => {
    const output = { stdout: 'ok', stderr: '', exit_code: 2, work_dir: '/w', truncated: true }
    const done = callOf(call({ tool: 'run_command', status: 'completed', preparedExecution: prepared, result: { output } }))
    expect(done.kind === 'command' && done.output).toEqual(output)
    expect(commandFailed(output)).toBe(true)
    const odd = callOf(call({ tool: 'run_command', status: 'failed', preparedExecution: prepared, result: { output: { stdout: 'ok' } } }))
    expect(odd.kind === 'command' && odd.output).toBeUndefined()
  })

  it('reads a built-in call whose arguments miss the contract as any tool', () => {
    expect(callOf(call({ tool: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'a', status: 'weird' }] }) })).kind).toBe('tool')
    expect(callOf(call({ tool: 'Agent', arguments: '{"description": 1}' })).kind).toBe('tool')
    expect(callOf(call({ tool: 'Agent', arguments: 'not json' })).kind).toBe('tool')
  })

  it('names other tools by their title, then their name, with their server', () => {
    expect(callOf(call({ tool: 'mock__echo', server: 'mock', annotations: { title: 'Echo' } }))).toEqual({ kind: 'tool', name: 'Echo', server: 'mock' })
    expect(callOf(call({ tool: 'create_scheduled_job', server: 'cron' }))).toEqual({ kind: 'tool', name: 'create_scheduled_job', server: 'cron' })
  })

  it('reads the call an approval asks about', () => {
    const params = { threadId: 't', turnId: 'u', itemId: 'c', approvalId: 'a', server: '', tool: 'run_command', arguments: {}, availableDecisions: [], preparedExecution: prepared }
    expect(approvalCallOf(params).kind).toBe('command')
    expect(approvalCallOf({ ...params, tool: 'mock__echo', server: 'mock', preparedExecution: undefined })).toEqual({ kind: 'tool', name: 'mock__echo', server: 'mock' })
  })

  it('waits for approval only while pending', () => {
    const c = call({ approval: { id: 'ap', requestedAt: '' } })
    expect(waitsForApproval(c)).toBe(true)
    expect(waitsForApproval({ ...c, status: 'inProgress' })).toBe(false)
    expect(waitsForApproval({ ...c, approval: { id: 'ap', requestedAt: '', decision: 'accept' } })).toBe(false)
  })

  it('pairs questions with stored answers', () => {
    const args = JSON.stringify({ questions: [{ id: 'q', header: 'H', question: 'Which?' }] })
    const asked = call({ tool: 'request_user_input', status: 'inProgress', arguments: args, await: { by: 'user', request: {} } })
    expect(waitsForAnswer(asked)).toBe(true)
    expect(callOf(asked)).toEqual({ kind: 'question', questions: [{ id: 'q', header: 'H', question: 'Which?', answers: undefined }] })
    const answered = { ...asked, status: 'completed' as const, result: { output: { q: { answers: ['Go'] } } } }
    expect(waitsForAnswer(answered)).toBe(false)
    const read = callOf(answered)
    expect(read.kind === 'question' && read.questions[0]?.answers).toEqual(['Go'])
  })

  it('reads plans', () => {
    const c = call({ tool: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'a', status: 'in_progress' }] }) })
    expect(callOf(c)).toEqual({ kind: 'plan', plan: { plan: [{ step: 'a', status: 'in_progress' }] } })
  })

  it('reads a subagent task and the thread it runs in', () => {
    const c = call({ tool: 'Agent', arguments: JSON.stringify({ description: 'd', prompt: 'p' }), await: { by: 'agent', threadId: 'child', request: {} } })
    expect(callOf(c)).toEqual({ kind: 'subagent', task: { description: 'd', prompt: 'p', threadId: 'child' } })
  })
})

describe('memory_search', () => {
  const call = (extra: Partial<ItemRow>) => item('c', 1, { type: 'toolCall', status: 'pending', ...extra })

  it('reads the query and the memories found', () => {
    const found = { memories: [{ id: 'x', scope: 'workspace', workspaceId: 'w', text: 'uses tabs' }] }
    const c = call({ tool: 'memory_search', arguments: JSON.stringify({ query: 'tabs' }), status: 'completed', result: { output: found } })
    expect(callOf(c)).toEqual({ kind: 'memorySearch', search: { query: 'tabs', memories: found.memories } })
    expect(callOf(call({ tool: 'memory_search', arguments: '{', status: 'inProgress' }))).toEqual({ kind: 'memorySearch', search: { query: undefined, memories: undefined } })
    expect(callOf(call({ tool: 'mock__echo' })).kind).toBe('tool')
  })
})

describe('context', () => {
  const stats = { model: 'm', budgetTokens: 1000, compactAtTokens: 800, systemTokens: 100, messagesTokens: 250, memoryTokens: 50, toolsTokens: 150, estimatedTokens: 500 }

  it('scales the estimated parts to the calibrated total', () => {
    const u = contextUse({ ...stats, calibratedTokens: 600 })
    expect(u).toEqual({ used: 600, budget: 1000, compactAt: 800, system: 120, tools: 180, memory: 60, messages: 240, calibrated: true })
    expect(contextUse({ ...stats, calibratedTokens: 500 }).calibrated).toBe(false)
  })

  it('reads one call per item carrying stats, and skips compactions for the latest', () => {
    const t = timelineFromPage(
      page(
        [
          item('mem', 1, { type: 'memoryContext', memory: [{ id: 'x', scope: 'global', text: 'likes tea' }] }),
          item('a', 2, { contextStats: stats, usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 1 } }),
          item('tool', 3, { type: 'toolCall' }),
          item('c', 4, { type: 'contextCompaction', contextStats: { ...stats, estimatedTokens: 900 } }),
        ],
        [turn('u1', 1)],
      ),
    )
    const calls = modelCalls(t)
    expect(calls.map((c) => [c.itemId, c.kind])).toEqual([
      ['a', 'response'],
      ['c', 'compaction'],
    ])
    expect(latestContextCall(calls)?.itemId).toBe('a')
  })

  it("reads a call's memory from the snapshot it was sent with", () => {
    const tea = { id: 'x', scope: 'global' as const, text: 'likes tea' }
    const tabs = { id: 'y', scope: 'workspace' as const, workspaceId: 'w', text: 'uses tabs' }
    const t = timelineFromPage(
      page(
        [
          item('mem', 1, { type: 'memoryContext', memory: [tea, tabs] }),
          item('a', 2, { contextStats: { ...stats, globalMemory: { tokens: 10, ids: ['x'] }, localMemory: { tokens: 40, ids: ['y'] } } }),
          item('c', 3, { type: 'contextCompaction' }),
          item('mem2', 4, { type: 'memoryContext', memory: [tabs] }),
          item('b', 5, { contextStats: { ...stats, globalMemory: { tokens: 0, ids: [] }, localMemory: { tokens: 40, ids: ['y'] } } }),
          item('d', 6, { contextStats: stats }),
          item('e', 7, { contextStats: { ...stats, calibratedTokens: 250, localMemory: { tokens: 40, ids: ['y'] } } }),
        ],
        [turn('u1', 1)],
      ),
    )
    const [a, b, d, e] = modelCalls(t)
    expect(promptMemory(t, a!)).toEqual({
      global: { tokens: 10, ids: ['x'], entries: [tea] },
      local: { tokens: 40, ids: ['y'], entries: [tabs] },
    })
    expect(promptMemory(t, b!)).toEqual({ global: undefined, local: { tokens: 40, ids: ['y'], entries: [tabs] } })
    expect(promptMemory(t, d!)).toBeUndefined()
    expect(promptMemory(t, e!)?.local?.tokens).toBe(20)
    // The snapshot is in a part of the thread not loaded.
    const tail = { ...t, items: t.items.slice(1, 2), hasMore: true }
    expect(promptMemory(tail, modelCalls(tail)[0]!)?.global?.entries).toBeUndefined()
  })
})

describe('elapsed and span', () => {
  const now = Date.parse('2026-10-27T12:00:00Z')
  const at = (s: number) => new Date(now - s * 1000).toISOString()
  it('rounds to the unit a list shows, into the past or the future', () => {
    expect(elapsed(at(30), now)).toEqual({ unit: 'now' })
    expect(elapsed(at(-30), now)).toEqual({ unit: 'soon' })
    expect(elapsed(at(300), now)).toEqual({ unit: 'minute', n: 5, future: false })
    expect(elapsed(at(-7200), now)).toEqual({ unit: 'hour', n: 2, future: true })
    expect(elapsed(at(3 * 86400), now)).toEqual({ unit: 'day', n: 3, future: false })
    expect(elapsed(at(-60 * 86400), now)).toEqual({ unit: 'day', n: 60, future: true })
    expect(elapsed(at(60 * 86400), now)).toEqual({ unit: 'date', at: now - 60 * 86400 * 1000 })
    expect(elapsed('not a time', now)).toBeUndefined()
  })
  it('splits a duration the way it is shown', () => {
    const start = new Date(now).toISOString()
    const end = (ms: number) => new Date(now + ms).toISOString()
    expect(span(start, end(250))).toEqual({ ms: 250 })
    expect(span(start, end(3400))).toEqual({ s: 3.4, digits: 1 })
    expect(span(start, end(42_000))).toEqual({ s: 42, digits: 0 })
    expect(span(start, end(74_000))).toEqual({ m: 1, s: 14 })
    expect(span(start, end(-1))).toBeUndefined()
  })
})

describe('schedules', () => {
  it('writes each schedule as a five-field spec and reads it back', () => {
    const all: Schedule[] = [
      { every: 'hour', minute: 15 },
      { every: 'day', hour: 9, minute: 29 },
      { every: 'weekday', hour: 18, minute: 0 },
      { every: 'week', day: 0, hour: 8, minute: 5 },
      { every: 'month', date: 31, hour: 23, minute: 59 },
    ]
    expect(all.map(cronSpec)).toEqual(['15 * * * *', '29 9 * * *', '0 18 * * 1-5', '5 8 * * 0', '59 23 31 * *'])
    for (const s of all) expect(scheduleOf(cronSpec(s))).toEqual(s)
  })
  it('reads descriptors, and leaves specs it cannot describe', () => {
    expect(scheduleOf('@daily')).toEqual({ every: 'day', hour: 0, minute: 0 })
    expect(scheduleOf('@weekly')).toEqual({ every: 'week', day: 0, hour: 0, minute: 0 })
    for (const spec of ['*/5 * * * *', '0 9 * * 1,3', '0 9 1 6 *', '0 9 1 * 1', '0 9 * * 7', '60 9 * * *', '@yearly', '0 9 * *']) {
      expect(scheduleOf(spec)).toBeUndefined()
    }
  })
})
