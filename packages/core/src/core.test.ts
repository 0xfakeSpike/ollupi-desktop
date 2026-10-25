import type { ItemRow, ThreadPage, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import {
  activeTurn,
  appendDelta,
  commandLine,
  groupByTurn,
  groupThreadsByWorkspace,
  planOf,
  prependPage,
  refreshFromPage,
  shellCommand,
  timelineFromPage,
  upsertItem,
  upsertThread,
  upsertTurn,
  waitsForApproval,
} from './index'

const thread: ThreadRow = {
  id: 'th',
  preview: 'hello',
  settings: { permissions: {} },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const turn = (id: string, seq: number, status: TurnRow['status'] = 'completed'): TurnRow => ({
  id,
  threadId: 'th',
  seq,
  status,
  model: { name: 'm', connection: 'm' },
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  startedAt: '2026-01-01T00:00:00Z',
})

const item = (id: string, seq: number, turnId = 'u1', extra: Partial<ItemRow> = {}): ItemRow => ({
  id,
  turnId,
  seq,
  type: 'agentMessage',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const page = (items: ItemRow[], turns: TurnRow[], hasMore = false): ThreadPage => ({ thread, turns, items, hasMore })

describe('timeline', () => {
  it('sorts pages and merges older pages without duplicates', () => {
    const t = timelineFromPage(page([item('c', 3), item('b', 2)], [turn('u1', 1)], true))
    expect(t.items.map((i) => i.id)).toEqual(['b', 'c'])
    const merged = prependPage(t, page([item('a', 1), item('b', 2)], [turn('u1', 1)]))
    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(merged.hasMore).toBe(false)
  })

  it('streams deltas into a started item and lets completion replace the text', () => {
    let t = timelineFromPage(page([], [turn('u1', 1, 'inProgress')]))
    t = upsertItem(t, item('m', 1, 'u1', { status: 'inProgress', text: '' }))
    t = appendDelta(t, 'm', 'Hel')
    t = appendDelta(t, 'm', 'lo')
    t = appendDelta(t, 'unknown', 'x')
    expect(t.items[0]!.text).toBe('Hello')
    t = upsertItem(t, item('m', 1, 'u1', { text: 'Hello!' }))
    expect(t.items).toHaveLength(1)
    expect(t.items[0]!.text).toBe('Hello!')
  })

  it('tracks the active turn through status changes', () => {
    let t = timelineFromPage(page([], [turn('u1', 1)]))
    t = upsertTurn(t, turn('u2', 2, 'inProgress'))
    expect(activeTurn(t)?.id).toBe('u2')
    t = upsertTurn(t, turn('u2', 2, 'completed'))
    expect(activeTurn(t)).toBeUndefined()
  })

  it('keeps older history when refreshing from a new first page', () => {
    const t = prependPage(timelineFromPage(page([item('c', 3)], [turn('u1', 1)], true)), page([item('b', 2)], [], true))
    const r = refreshFromPage(t, page([item('c', 3), item('d', 4)], [turn('u1', 1)], true))
    expect(r.items.map((i) => i.id)).toEqual(['b', 'c', 'd'])
  })

  it('groups items by turn in order', () => {
    const t = timelineFromPage(page([item('a', 1, 'u1'), item('b', 2, 'u2'), item('c', 3, 'u2')], [turn('u1', 1), turn('u2', 2)]))
    expect(groupByTurn(t).map((g) => [g.turn?.id, g.items.length])).toEqual([
      ['u1', 1],
      ['u2', 2],
    ])
  })
})

describe('threads', () => {
  it('upserts newest first and keeps the known status', () => {
    let list = upsertThread([], thread, 'active')
    list = upsertThread(list, { ...thread, id: 'th2', updatedAt: '2026-02-01T00:00:00Z' })
    list = upsertThread(list, { ...thread, preview: 'renamed' })
    expect(list.map((t) => t.id)).toEqual(['th2', 'th'])
    expect(list[1]).toMatchObject({ preview: 'renamed', status: 'active' })
  })

  it('groups by active workspace with loose threads last', () => {
    const ws = { id: 'w', name: 'W', rootPath: '/w', settings: { permissions: {} }, createdAt: '', updatedAt: '' }
    const archived = { ...ws, id: 'old', archivedAt: '2026-01-01T00:00:00Z' }
    const list = upsertThread(upsertThread([], { ...thread, workspaceId: 'w' }), { ...thread, id: 'loose' })
    const groups = groupThreadsByWorkspace([ws, archived], list)
    expect(groups.map((g) => [g.workspace?.id, g.threads.map((t) => t.id)])).toEqual([
      ['w', ['th']],
      [undefined, ['loose']],
    ])
  })
})

describe('items', () => {
  it('reads shell commands, preferring the frozen execution', () => {
    const it = item('s', 1, 'u1', {
      type: 'toolCall',
      tool: 'run_command',
      arguments: JSON.stringify({ program: 'ls', args: ['-la'] }),
      preparedExecution: { cwd: '/w', settingsDigest: '', argumentsDigest: '', program: 'git', args: ['commit', '-m', "it's"] },
    })
    const cmd = shellCommand(it)!
    expect(commandLine(cmd)).toBe(`git commit -m 'it'\\''s'`)
    expect(cmd.workDir).toBe('/w')
  })

  it('reads plans and pending approvals', () => {
    const it = item('p', 1, 'u1', {
      type: 'toolCall',
      status: 'inProgress',
      tool: 'update_plan',
      arguments: JSON.stringify({ plan: [{ step: 'a', status: 'in_progress' }, { step: 'b', status: 'weird' }] }),
      approval: { id: 'ap', requestedAt: '' },
    })
    expect(planOf(it)?.steps).toEqual([
      { step: 'a', status: 'in_progress' },
      { step: 'b', status: 'pending' },
    ])
    expect(waitsForApproval(it)).toBe(true)
  })
})
