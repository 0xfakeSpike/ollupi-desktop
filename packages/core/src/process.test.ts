import type { ItemRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import { answerOf, layoutTurn, summarizeProcess, type TurnPart } from './process'

let seq = 0
const at = (s: number) => `2026-01-01T00:00:${String(s).padStart(2, '0')}Z`
const item = (id: string, type: ItemRow['type'], responseId: string | undefined, extra: Partial<ItemRow> = {}): ItemRow => ({
  id,
  turnId: 't',
  seq: ++seq,
  type,
  status: 'completed',
  responseId,
  startedAt: at(seq),
  completedAt: at(seq + 1),
  ...extra,
})
const prepared = { cwd: '/w', settingsDigest: '', argumentsDigest: '' }
const command = (id: string, responseId: string, extra: Partial<ItemRow> = {}) =>
  item(id, 'toolCall', responseId, { tool: 'run_command', preparedExecution: { ...prepared, program: 'git', args: ['status'] }, ...extra })
const edit = (id: string, responseId: string, path: string, extra: Partial<ItemRow> = {}) =>
  item(id, 'toolCall', responseId, { tool: 'edit_file', preparedExecution: { ...prepared, files: [{ path, after: '', diff: '', added: 2, removed: 1 }] }, ...extra })

const shape = (parts: TurnPart[]) => parts.map((p) => (p.kind === 'process' ? ['process', p.items.map((i) => i.id)] : [p.kind, p.item.id]))

describe('a turn as it reads', () => {
  it('puts the responses that asked for tools in the process and the last one as the answer', () => {
    const items = [
      item('input', 'userMessage', undefined),
      item('memory', 'memoryContext', undefined),
      item('think1', 'reasoning', 'r1'),
      item('note1', 'agentMessage', 'r1'),
      command('run1', 'r1'),
      command('run2', 'r1'),
      item('think2', 'reasoning', 'r2'),
      item('answer', 'agentMessage', 'r2'),
    ]
    expect(shape(layoutTurn(items))).toEqual([
      ['message', 'input'],
      ['process', ['memory', 'think1', 'note1', 'run1', 'run2', 'think2']],
      ['answer', 'answer'],
    ])
  })

  it('has no answer while the latest response has asked for tools', () => {
    const items = [item('input', 'userMessage', undefined), item('note', 'agentMessage', 'r1'), command('run', 'r1', { status: 'pending' })]
    expect(answerOf(items)).toBeUndefined()
    expect(shape(layoutTurn(items))).toEqual([
      ['message', 'input'],
      ['process', ['note', 'run']],
    ])
  })

  it('takes the text a response is streaming as the answer until tool calls follow', () => {
    const streaming = [item('input', 'userMessage', undefined), command('run', 'r1'), item('text', 'agentMessage', 'r2', { status: 'inProgress', completedAt: null })]
    expect(answerOf(streaming)?.id).toBe('text')
    const asked = [...streaming.slice(0, 2), { ...streaming[2]!, status: 'completed' as const }, command('run2', 'r2')]
    expect(answerOf(asked)).toBeUndefined()
  })

  it('does not take a compaction for the latest response', () => {
    const items = [item('input', 'userMessage', undefined), item('text', 'agentMessage', 'r1'), command('run', 'r1'), item('compact', 'contextCompaction', 'c1')]
    expect(answerOf(items)).toBeUndefined()
  })

  it('splits the process where the person steered', () => {
    const items = [
      item('input', 'userMessage', undefined),
      command('run1', 'r1'),
      item('steer', 'userMessage', undefined),
      command('run2', 'r2'),
      item('answer', 'agentMessage', 'r3'),
    ]
    expect(shape(layoutTurn(items))).toEqual([
      ['message', 'input'],
      ['process', ['run1']],
      ['message', 'steer'],
      ['process', ['run2']],
      ['answer', 'answer'],
    ])
  })

  it('leaves a failed response in the process with its partial text as the last words', () => {
    const items = [item('input', 'userMessage', undefined), item('text', 'agentMessage', 'r1', { status: 'failed' }), item('err', 'error', 'r1', { status: 'failed' })]
    expect(shape(layoutTurn(items))).toEqual([
      ['message', 'input'],
      ['answer', 'text'],
      ['process', ['err']],
    ])
  })
})

describe('a process summary', () => {
  it('counts calls by kind, files changed once each, lines as the changes that went through', () => {
    const items = [
      item('think', 'reasoning', 'r1'),
      command('run1', 'r1'),
      command('run2', 'r1'),
      edit('e1', 'r1', 'a.ts'),
      edit('e2', 'r2', 'a.ts'),
      edit('e3', 'r2', 'b.ts'),
      edit('e4', 'r2', 'c.ts', { status: 'declined' }),
      item('read', 'toolCall', 'r2', { tool: 'read_file', arguments: JSON.stringify({ path: 'a.ts' }) }),
      item('mcp', 'toolCall', 'r2', { tool: 'echo', server: 'mock' }),
    ]
    const s = summarizeProcess(items)
    expect(s).toMatchObject({ commands: 2, filesChanged: 2, linesAdded: 6, linesRemoved: 3, reads: 1, searches: 0, subagents: 0, tools: 1 })
    expect(s.startedAt).toBe(items[0]!.startedAt)
    expect(s.completedAt).toBe(items.at(-1)!.completedAt)
  })

  it('has no end while an item runs', () => {
    expect(summarizeProcess([command('run', 'r1', { status: 'inProgress', completedAt: null })]).completedAt).toBeUndefined()
  })
})
