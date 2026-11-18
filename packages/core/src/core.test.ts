import type { ContextStats, ItemRow, ThreadPageResult, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import {
  activeTurn,
  contextUse,
  latestContextCall,
  modelCalls,
  appendDelta,
  applyEvent,
  approvalCallOf,
  callOf,
  commandFailed,
  commandLine,
  currentPlan,
  groupByTurn,
  groupByWorkspace,
  groupReads,
  readText,
  subagentReport,
  queuedTurns,
  turnMessages,
  turnStartedAt,
  promptMemory,
  prependPage,
  refreshFromPage,
  removeThread,
  threadCursor,
  timelineFromPage,
  titleFromMessage,
  upsertItem,
  upsertThread,
  upsertTurn,
  unread,
  waitingFor,
  waitsForSubagents,
  waitsForAnswer,
  waitsForApproval,
  elapsed,
  span,
  cronSpec,
  scheduleOf,
  onceAt,
  type Schedule,
} from './index'

const thread = (extra: Partial<ThreadRow> = {}): ThreadRow => ({
  id: 'th',
  title: 'hello',
  settings: { permissions: {} },
  status: 'idle',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const turn = (id: string, status: TurnRow['status'] = 'completed'): TurnRow => ({
  id,
  threadId: 'th',
  status,
  model: { name: 'm', connection: 'm' },
  agent: 'full-main-agent',
  usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 },
  responses: [],
  queuedAt: '2026-01-01T00:00:00Z',
})

const item = (id: string, seq: number, extra: Partial<ItemRow> = {}): ItemRow => ({
  id,
  turnId: 'u1',
  seq,
  updated: seq,
  type: 'agentMessage',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const page = (items: ItemRow[], turns: TurnRow[], hasMore = false, seq = 10): ThreadPageResult => ({ thread: thread(), turns, items, seq, hasMore })

describe('timeline', () => {
  it('sorts pages and merges an older page without duplicates', () => {
    const t = timelineFromPage(page([item('c', 3), item('b', 2)], [turn('u1')], true))
    expect(t.items.map((i) => i.id)).toEqual(['b', 'c'])
    const merged = prependPage(t, page([item('a', 1), item('b', 2)], [turn('u0'), turn('u1')]))
    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(merged.turns.map((x) => x.id)).toEqual(['u0', 'u1'])
    expect(merged.hasMore).toBe(false)
  })

  it('applies only what was committed after the page was read', () => {
    let t = timelineFromPage(page([item('a', 1, { text: 'old' })], [turn('u1', 'inProgress')], false, 5))
    t = applyEvent(t, { method: 'item/changed', params: { threadId: 'th', item: item('a', 1, { text: 'stale', updated: 4 }), seq: 4 } })
    expect(t.items[0]!.text).toBe('old')
    t = applyEvent(t, { method: 'item/changed', params: { threadId: 'th', item: item('a', 1, { text: 'new', updated: 6 }), seq: 6 } })
    t = applyEvent(t, { method: 'turn/changed', params: { threadId: 'th', turn: turn('u1'), seq: 6 } })
    expect([t.items[0]!.text, t.turns[0]!.status]).toEqual(['new', 'completed'])
    // An item changed twice keeps its latest change, whatever order they come in.
    t = upsertItem(t, item('a', 1, { text: 'newer', updated: 8 }))
    t = upsertItem(t, item('a', 1, { text: 'new', updated: 6 }))
    expect(t.items[0]!.text).toBe('newer')
  })

  it('streams text into an item made for it until the item is kept', () => {
    let t = timelineFromPage(page([item('a', 1)], [turn('u1', 'inProgress')]))
    const delta = (itemId: string, d: string) => ({ turnId: 'u1', itemId, delta: d })
    t = appendDelta(appendDelta(t, delta('m', 'Hel'), 'agentMessage'), delta('m', 'lo'), 'agentMessage')
    expect(t.items.map((i) => [i.id, i.text, i.status])).toEqual([
      ['a', undefined, 'completed'],
      ['m', 'Hello', 'inProgress'],
    ])
    // Kept, it is the log's: a delta after it changes nothing.
    t = upsertItem(t, item('m', 2, { text: 'Hello!' }))
    t = appendDelta(t, delta('m', 'x'), 'agentMessage')
    expect(t.items.map((i) => i.text)).toEqual([undefined, 'Hello!'])
  })

  it('drops streamed text the turn never kept', () => {
    const streamed = (t: ReturnType<typeof timelineFromPage>) => appendDelta(t, { turnId: 'u1', itemId: 'm', delta: 'Hel' }, 'agentMessage')
    const start = timelineFromPage(page([], [turn('u1', 'inProgress')]))
    expect(upsertItem(streamed(start), item('e', 2, { type: 'error', error: 'model failed' })).items.map((i) => i.id)).toEqual(['e'])
    expect(upsertTurn(streamed(start), turn('u1', 'interrupted')).items).toEqual([])
  })

  it('follows the turn in progress through its status', () => {
    let t = upsertTurn(timelineFromPage(page([], [turn('u1')])), turn('u2', 'inProgress'))
    expect(activeTurn(t)?.id).toBe('u2')
    t = upsertTurn(t, turn('u2'))
    expect(activeTurn(t)).toBeUndefined()
  })

  it('takes the turns behind the one in progress as queued, each with its message', () => {
    const t = timelineFromPage(
      page(
        [item('m1', 1, { type: 'userMessage', text: 'go' }), item('m2', 3, { turnId: 'u2', type: 'userMessage', text: 'and this' }), item('m3', 4, { turnId: 'u3', type: 'userMessage', text: 'and that' })],
        [turn('u1', 'inProgress'), turn('u2', 'queued'), turn('u3', 'queued')],
      ),
    )
    expect(activeTurn(t)?.id).toBe('u1')
    expect(queuedTurns(t).map((x) => x.id)).toEqual(['u2', 'u3'])
    expect(turnMessages(t, 'u3').map((x) => x.text)).toEqual(['and that'])
  })

  it('says what the turn in progress waits for: its own calls, or a subagent by the status', () => {
    const asks = item('c', 1, { type: 'toolCall', status: 'pending', approval: { approvalId: 'a', askedAt: '2026-01-01T00:00:00Z', availableDecisions: ['accept', 'decline'] } })
    const answer = item('q', 2, { type: 'toolCall', status: 'inProgress', input: { request: {}, askedAt: '2026-01-01T00:00:00Z', answered: false } })
    const running = (items: ItemRow[]) => timelineFromPage(page(items, [turn('u1', 'inProgress')]))
    expect(waitingFor(running([]), 'active')).toBeUndefined()
    expect(waitingFor(running([asks, answer]), 'active')).toBe('approval')
    expect(waitingFor(running([answer]), 'active')).toBe('answer')
    expect(waitingFor(running([]), 'waitingOnUserInput')).toBe('answer')
    expect(waitingFor(running([]), 'waitingOnApproval')).toBe('approval')
    expect(waitingFor(timelineFromPage(page([asks], [turn('u1')])), 'waitingOnApproval')).toBeUndefined()
  })

  it('waits for the subagents the turn launched once it has nothing else under way', () => {
    const launch = item('s', 1, { type: 'toolCall', tool: 'general-sub-agent', childThreadId: 'child' })
    const running = (items: ItemRow[]) => timelineFromPage(page(items, [turn('u1', 'inProgress')]))
    expect(waitsForSubagents(running([launch]))).toBe(true)
    expect(waitsForSubagents(running([launch, item('c', 2, { type: 'toolCall', status: 'inProgress' })]))).toBe(false)
    expect(waitsForSubagents(running([launch, item('r', 2, { type: 'agentReport', launchItemId: 's' })]))).toBe(false)
    expect(waitsForSubagents(timelineFromPage(page([launch], [turn('u1')])))).toBe(false)
  })

  it('keeps older loaded history when refreshing from the latest page', () => {
    const t = prependPage(timelineFromPage(page([item('c', 3)], [turn('u1')], true)), page([item('b', 2)], [], true))
    const r = refreshFromPage(t, page([item('c', 3), item('d', 4)], [turn('u1')], true, 20))
    expect(r.items.map((i) => i.id)).toEqual(['b', 'c', 'd'])
    expect(r.seq).toBe(20)
  })

  it('starts a turn once it is queued and the turn before it has ended', () => {
    const at = (id: string, queuedAt: string, completedAt?: string): TurnRow => ({ ...turn(id), queuedAt, completedAt })
    const t = { turns: [at('u1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:09Z'), at('u2', '2026-01-01T00:00:05Z'), at('u3', '2026-01-01T00:00:20Z')] }
    expect(t.turns.map((x) => turnStartedAt(t, x))).toEqual(['2026-01-01T00:00:00Z', '2026-01-01T00:00:09Z', undefined])
  })

  it('groups items under turns; a turn without loaded items has no group', () => {
    const t = timelineFromPage(page([item('a', 1), item('b', 2, { turnId: 'u2' })], [turn('u1'), turn('u2'), turn('u3', 'queued')]))
    expect(groupByTurn(t).map((g) => [g.turn.id, g.items.length])).toEqual([
      ['u1', 1],
      ['u2', 1],
    ])
  })
})

describe('threads', () => {
  it('orders like thread/list: updatedAt, then createdAt, newest first', () => {
    let list = upsertThread([], thread({ id: 'a', status: 'active' }))
    list = upsertThread(list, thread({ id: 'b', createdAt: '2026-01-02T00:00:00Z' }))
    list = upsertThread(list, thread({ id: 'c', updatedAt: '2026-02-01T00:00:00Z' }))
    expect(list.map((t) => t.id)).toEqual(['c', 'b', 'a'])
    list = upsertThread(list, thread({ id: 'a', title: 'renamed' }))
    expect(list.find((t) => t.id === 'a')).toMatchObject({ title: 'renamed', status: 'idle' })
  })

  it('drops a thread once archived or deleted', () => {
    const list = upsertThread(upsertThread([], thread({ id: 'a' })), thread({ id: 'b' }))
    expect(upsertThread(list, thread({ id: 'a', archivedAt: '2026-03-01T00:00:00Z' })).map((t) => t.id)).toEqual(['b'])
    expect(removeThread(list, 'b').map((t) => t.id)).toEqual(['a'])
  })

  it('titles a thread from the first line of its first message', () => {
    expect(titleFromMessage('\n  Fix   the build \nthen deploy')).toBe('Fix the build')
    expect(titleFromMessage('x'.repeat(80))).toBe('x'.repeat(60) + '…')
    expect(titleFromMessage('', ['screenshot.png'])).toBe('screenshot.png')
    expect(titleFromMessage('')).toBe('')
  })

  it('orders threads updated and created together by id, as thread/list does', () => {
    const list = upsertThread(upsertThread([], thread({ id: 'a' })), thread({ id: 'b' }))
    expect(list.map((t) => t.id)).toEqual(['b', 'a'])
    expect(threadCursor(list[1]!)).toEqual({ updatedAt: list[1]!.updatedAt, createdAt: list[1]!.createdAt, id: 'a' })
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

  it('puts what waits on the person first: its threads, then its workspace', () => {
    const ws = (id: string) => ({ id, name: id, rootPath: `/${id}`, settings: { permissions: {} }, createdAt: '', updatedAt: '' })
    const at = (id: string, workspaceId: string | undefined, updatedAt: string, status: ThreadRow['status']): ThreadRow => thread({ id, workspaceId, updatedAt, status })
    // Newest first, as thread/list orders them.
    const list = [
      at('a1', 'a', '2026-01-06T00:00:00Z', 'active'),
      at('loose1', undefined, '2026-01-05T00:00:00Z', 'idle'),
      at('b1', 'b', '2026-01-04T00:00:00Z', 'idle'),
      at('b2', 'b', '2026-01-03T00:00:00Z', 'waitingOnUserInput'),
      at('loose2', undefined, '2026-01-02T00:00:00Z', 'waitingOnApproval'),
      at('c1', 'c', '2026-01-01T12:00:00Z', 'waitingOnApproval'),
      at('b3', 'b', '2026-01-01T00:00:00Z', 'waitingOnApproval'),
    ]
    const groups = groupByWorkspace([ws('a'), ws('b'), ws('c'), ws('d')], list)
    expect(groups.map((g) => [g.workspace?.id, g.threads.map((t) => t.id)])).toEqual([
      ['b', ['b2', 'b3', 'b1']],
      ['c', ['c1']],
      ['a', ['a1']],
      ['d', []],
      [undefined, ['loose2', 'loose1']],
    ])
  })
  it('is unread from the end of a turn until read, as the engine says', () => {
    expect(unread(thread())).toBe(false)
    expect(unread(thread({ repliedAt: '2026-01-01T00:00:01.5Z' }))).toBe(true)
    expect(unread(thread({ repliedAt: '2026-01-01T00:00:01.5Z', readAt: '2026-01-01T00:00:01.25Z' }))).toBe(true)
    expect(unread(thread({ repliedAt: '2026-01-01T00:00:01.25Z', readAt: '2026-01-01T00:00:01.5Z' }))).toBe(false)
  })

  it('orders workspaces by the work done in them last, not by when they were added', () => {
    const ws = (id: string, updatedAt: string) => ({ id, name: id, rootPath: `/${id}`, settings: { permissions: {} }, createdAt: updatedAt, updatedAt })
    const at = (id: string, workspaceId: string, updatedAt: string): ThreadRow => thread({ id, workspaceId, updatedAt })
    // workspace/list's order: the workspaces changed last first.
    const workspaces = [ws('docs', '2026-01-08T00:00:00Z'), ws('app', '2026-01-07T00:00:00Z'), ws('fresh', '2026-01-09T12:00:00.5Z'), ws('old', '2026-01-01T00:00:00Z')]
    const list = [at('s1', 'app', '2026-01-11T14:31:31.610699Z'), at('d1', 'docs', '2026-01-08T08:28:18.489406Z'), at('o1', 'old', '2026-01-09T12:00:00.25Z')]
    expect(groupByWorkspace(workspaces, list).map((g) => g.workspace?.id)).toEqual(['app', 'fresh', 'old', 'docs', undefined])
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
    const c = call({ approval: { approvalId: 'ap', askedAt: '', availableDecisions: ['accept', 'decline'] } })
    expect(waitsForApproval(c)).toBe(true)
    expect(waitsForApproval({ ...c, status: 'inProgress' })).toBe(false)
    expect(waitsForApproval({ ...c, approval: { approvalId: 'ap', askedAt: '', availableDecisions: ['accept', 'decline'], decision: 'accept' } })).toBe(false)
  })

  it('pairs questions with stored answers', () => {
    const args = JSON.stringify({ questions: [{ id: 'q', header: 'H', question: 'Which?' }] })
    const asked = call({ tool: 'request_user_input', status: 'inProgress', arguments: args, input: { request: {}, askedAt: '', answered: false } })
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

  it('reads a subagent task, the role it runs as and the thread its launch started', () => {
    const c = call({ tool: 'general-sub-agent', status: 'completed', arguments: JSON.stringify({ description: 'd', prompt: 'p' }), childThreadId: 'child', result: { output: { subagent: 'child', description: 'd', note: 'n' } } })
    expect(callOf(c)).toEqual({ kind: 'subagent', task: { description: 'd', prompt: 'p', role: 'general-sub-agent', threadId: 'child' } })
    const b = call({ tool: 'browser-sub-agent', arguments: JSON.stringify({ description: 'd', prompt: 'p' }) })
    expect(callOf(b)).toEqual({ kind: 'subagent', task: { description: 'd', prompt: 'p', role: 'browser-sub-agent', threadId: undefined } })
  })

  it('finds a subagent’s report by the call that launched it', () => {
    const launch = call({ tool: 'general-sub-agent', callId: 'call_0' })
    // Another launch a provider gave the same call id has a report of its own.
    const other = item('x', 8, { type: 'agentReport', callId: 'call_0', launchItemId: 'earlier' })
    const report = item('r', 9, { type: 'agentReport', callId: 'call_0', launchItemId: 'c', status: 'completed', result: { output: 'done' } })
    expect(subagentReport([other, launch, report], launch)?.id).toBe('r')
    expect(subagentReport([other, launch], launch)).toBeUndefined()
  })


  it('reads read_file, glob and grep with their outputs', () => {
    const output = { path: 'a.go', text: '3\tfunc A() {}\n4\t}\n', startLine: 3, endLine: 4, totalLines: 4, size: 30 }
    const read = callOf(call({ tool: 'read_file', status: 'completed', arguments: JSON.stringify({ path: 'a.go', offset: 3 }), result: { output } }))
    expect(read).toEqual({ kind: 'read', args: { path: 'a.go', offset: 3 }, output })
    expect(read.kind === 'read' && read.output && readText(read.output)).toBe('func A() {}\n}\n')
    expect(callOf(call({ tool: 'glob', arguments: JSON.stringify({ pattern: '**/*.go' }) }))).toEqual({ kind: 'glob', args: { pattern: '**/*.go' }, output: undefined })
    expect(callOf(call({ tool: 'grep', arguments: JSON.stringify({ pattern: 'x', context: 99 }) })).kind).toBe('tool')
  })

  it('groups read calls next to each other, but not one that waits on the person', () => {
    const read = (id: string, seq: number, extra: Partial<ItemRow> = {}) =>
      item(id, seq, { type: 'toolCall', status: 'completed', tool: 'read_file', arguments: JSON.stringify({ path: id }), ...extra })
    const text = item('m', 3, { type: 'agentMessage', text: 'hi' })
    const asked = read('r5', 6, { status: 'pending', approval: { approvalId: 'ap', askedAt: '', availableDecisions: ['accept', 'decline'] } })
    const groups = groupReads([read('r1', 1), read('r2', 2), text, read('r3', 4), read('r4', 5), asked, read('r6', 7)])
    expect(groups.map((g) => (g.kind === 'item' ? g.item.id : g.items.map((i) => i.id).join('+')))).toEqual(['r1+r2', 'm', 'r3+r4', 'r5', 'r6'])
  })

  it('reads tools the contract does not type as generic calls', () => {
    const search = call({ tool: 'memory_search', server: 'memory', arguments: JSON.stringify({ query: 'tabs' }) })
    expect(callOf(search)).toEqual({ kind: 'tool', name: 'memory_search', server: 'memory' })
  })
})

describe('currentPlan', () => {
  const plan = (id: string, seq: number, step: string, status: ItemRow['status'] = 'completed') =>
    item(id, seq, { type: 'toolCall', tool: 'update_plan', status, arguments: JSON.stringify({ plan: [{ step, status: 'in_progress' }] }) })

  it('is the last update_plan call that went through, from any turn', () => {
    const t = timelineFromPage(
      page(
        [plan('p1', 1, 'first'), { ...plan('p2', 2, 'second'), turnId: 'u2' }, plan('p3', 3, 'declined', 'declined'), plan('p4', 4, 'refused', 'failed'), item('m', 5)],
        [turn('u1'), turn('u2')],
      ),
    )
    expect(currentPlan(t)?.item.id).toBe('p2')
    expect(currentPlan(t)?.plan.plan[0].step).toBe('second')
  })

  it('is none before any plan', () => {
    expect(currentPlan(timelineFromPage(page([item('m', 1)], [turn('u1')])))).toBeUndefined()
  })
})

describe('context', () => {
  const stats = { model: 'm', budgetTokens: 1000, compactAtTokens: 800, systemTokens: 100, messagesTokens: 250, memoryTokens: 50, toolsTokens: 150, estimatedTokens: 500 }

  it('scales the estimated parts to the calibrated total', () => {
    const u = contextUse({ ...stats, calibratedTokens: 600 })
    expect(u).toEqual({ used: 600, budget: 1000, compactAt: 800, system: 120, tools: 180, memory: 60, messages: 240, calibrated: true })
    expect(contextUse({ ...stats, calibratedTokens: 500 }).calibrated).toBe(false)
  })

  const usage = { inputTokens: 400, cachedInputTokens: 100, cacheWriteInputTokens: 0, outputTokens: 20 }
  const withResponses = (responses: [string, ContextStats][]): TurnRow => ({ ...turn('u1'), responses: responses.map(([id, contextStats]) => ({ id, usage, contextStats })) })

  it("reads one call per turn response at its first item, and skips compactions for the latest", () => {
    const t = timelineFromPage(
      page(
        [
          item('mem', 1, { type: 'memoryContext', memory: [{ id: 'x', scope: 'global', text: 'likes tea' }] }),
          item('think', 2, { type: 'reasoning', responseId: 'r1' }),
          item('a', 3, { responseId: 'r1' }),
          item('tool', 4, { type: 'toolCall', responseId: 'r2' }),
          item('c', 5, { type: 'contextCompaction', responseId: 'r3' }),
          item('err', 6, { type: 'error' }),
        ],
        [withResponses([['r1', stats], ['r2', stats], ['r3', { ...stats, estimatedTokens: 900 }]])],
      ),
    )
    const calls = modelCalls(t)
    expect(calls.map((c) => [c.itemId, c.kind])).toEqual([
      ['think', 'response'],
      ['tool', 'response'],
      ['c', 'compaction'],
    ])
    expect(calls[0]!.usage).toEqual(usage)
    expect(latestContextCall(calls)?.itemId).toBe('tool')
  })

  it("reads a call's memory from the snapshot it was sent with", () => {
    const tea = { id: 'x', scope: 'global' as const, text: 'likes tea' }
    const tabs = { id: 'y', scope: 'workspace' as const, workspaceId: 'w', text: 'uses tabs' }
    const t = timelineFromPage(
      page(
        [
          item('mem', 1, { type: 'memoryContext', memory: [tea, tabs] }),
          item('a', 2, { responseId: 'ra' }),
          item('c', 3, { type: 'contextCompaction', responseId: 'rc' }),
          item('mem2', 4, { type: 'memoryContext', memory: [tabs] }),
          item('b', 5, { responseId: 'rb' }),
          item('d', 6, { responseId: 'rd' }),
          item('e', 7, { responseId: 're' }),
        ],
        [
          withResponses([
            ['ra', { ...stats, globalMemory: { tokens: 10, ids: ['x'] }, localMemory: { tokens: 40, ids: ['y'] } }],
            ['rc', stats],
            ['rb', { ...stats, globalMemory: { tokens: 0, ids: [] }, localMemory: { tokens: 40, ids: ['y'] } }],
            ['rd', stats],
            ['re', { ...stats, calibratedTokens: 250, localMemory: { tokens: 40, ids: ['y'] } }],
          ]),
        ],
      ),
    )
    const [a, , b, d, e] = modelCalls(t)
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
      { every: 'year', month: 6, date: 1, hour: 9, minute: 0 },
    ]
    expect(all.map(cronSpec)).toEqual(['15 * * * *', '29 9 * * *', '0 18 * * 1-5', '5 8 * * 0', '59 23 31 * *', '0 9 1 6 *'])
    for (const s of all) expect(scheduleOf(cronSpec(s))).toEqual(s)
  })
  it('writes a one-time task as its date’s yearly schedule', () => {
    expect(cronSpec(onceAt(new Date(2026, 10, 2, 9, 30)))).toBe('30 9 2 11 *')
  })
  it('reads descriptors, and leaves specs it cannot describe', () => {
    expect(scheduleOf('@daily')).toEqual({ every: 'day', hour: 0, minute: 0 })
    expect(scheduleOf('@weekly')).toEqual({ every: 'week', day: 0, hour: 0, minute: 0 })
    expect(scheduleOf('@yearly')).toEqual({ every: 'year', month: 1, date: 1, hour: 0, minute: 0 })
    for (const spec of ['*/5 * * * *', '0 9 * * 1,3', '0 9 1 6 1', '0 9 * 6 *', '0 9 1 13 *', '0 9 1 * 1', '0 9 * * 7', '60 9 * * *', '0 9 * *']) {
      expect(scheduleOf(spec)).toBeUndefined()
    }
  })
})
