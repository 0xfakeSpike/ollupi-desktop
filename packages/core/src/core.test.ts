import type { ItemRow, ThreadPageResult, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import {
  activeTurn,
  contextUse,
  latestContextCall,
  modelCalls,
  appendDelta,
  commandLine,
  groupByTurn,
  groupByWorkspace,
  memorySearchOf,
  planOf,
  promptMemory,
  prependPage,
  questionsOf,
  refreshFromPage,
  frozenCommand,
  commandOutput,
  subagentOf,
  timelineFromPage,
  upsertItem,
  upsertThread,
  upsertTurn,
  waitsForAnswer,
  waitsForApproval,
  toolTitle,
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

  it('reads the frozen command; before preparation there is none', () => {
    const c = call({
      tool: 'run_command',
      arguments: JSON.stringify({ program: 'ls', args: ['-la'] }),
      preparedExecution: { cwd: '/w', settingsDigest: '', argumentsDigest: '', program: 'git', args: ['commit', '-m', "it's"] },
    })
    const cmd = frozenCommand(c)!
    expect([commandLine(cmd), cmd.cwd]).toEqual([`git commit -m 'it'\\''s'`, '/w'])
    expect(frozenCommand({ ...c, preparedExecution: undefined })).toBeUndefined()
  })

  it('reads command output only when it matches the contract', () => {
    const output = { stdout: 'ok', stderr: '', exit_code: 2, work_dir: '/w', truncated: true }
    expect(commandOutput(call({ tool: 'run_command', status: 'completed', result: { output } }))).toEqual(output)
    expect(commandOutput(call({ tool: 'run_command', status: 'failed', result: { output: { stdout: 'ok' } } }))).toBeUndefined()
  })

  it('refuses arguments that do not match the contract', () => {
    expect(planOf(call({ tool: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'a', status: 'weird' }] }) }))).toBeUndefined()
    expect(subagentOf(call({ tool: 'Agent', arguments: '{"description": 1}' }))).toBeUndefined()
    expect(subagentOf(call({ tool: 'Agent', arguments: 'not json' }))).toBeUndefined()
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
    expect(questionsOf(asked)).toEqual([{ id: 'q', header: 'H', question: 'Which?', answers: undefined }])
    const answered = { ...asked, status: 'completed' as const, result: { output: { q: { answers: ['Go'] } } } }
    expect(waitsForAnswer(answered)).toBe(false)
    expect(questionsOf(answered)?.[0]?.answers).toEqual(['Go'])
  })

  it('reads plans', () => {
    const c = call({ tool: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'a', status: 'in_progress' }] }) })
    expect(planOf(c)?.plan).toEqual([{ step: 'a', status: 'in_progress' }])
  })
})

describe('memory_search', () => {
  const call = (extra: Partial<ItemRow>) => item('c', 1, { type: 'toolCall', status: 'pending', ...extra })

  it('reads the query and the memories found', () => {
    const found = { memories: [{ id: 'x', scope: 'workspace', workspaceId: 'w', text: 'uses tabs' }] }
    const c = call({ tool: 'memory_search', arguments: JSON.stringify({ query: 'tabs' }), status: 'completed', result: { output: found } })
    expect(memorySearchOf(c)).toEqual({ query: 'tabs', memories: found.memories })
    expect(toolTitle(c)).toBe('Searched memory for “tabs”')
    expect(memorySearchOf(call({ tool: 'memory_search', arguments: '{', status: 'inProgress' }))).toEqual({ query: undefined, memories: undefined })
    expect(memorySearchOf(call({ tool: 'mock__echo' }))).toBeUndefined()
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
