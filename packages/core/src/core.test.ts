import type { ItemRow, ThreadPageResult, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import {
  activeTurn,
  appendDelta,
  commandLine,
  groupByTurn,
  groupByWorkspace,
  planOf,
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
