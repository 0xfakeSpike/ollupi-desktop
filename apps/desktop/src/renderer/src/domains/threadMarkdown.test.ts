import type { ItemRow, ThreadRow, TurnRow } from '@ollupi/protocol'
import { describe, expect, it } from 'vitest'
import { threadMarkdown, type MarkdownWords } from './threadMarkdown'

const words: MarkdownWords = {
  title: 'Fix the build',
  you: 'You',
  agent: 'Agent',
  attachments: 'Attachments',
  plan: 'Plan',
  subagent: (task) => `Subagent: ${task}`,
  answered: (answer) => `Answered: ${answer}`,
  failed: 'The turn failed',
  stopped: 'Stopped',
}

const thread: ThreadRow = { id: 'th', title: 'Fix the build', settings: { permissions: {} }, createdAt: '', updatedAt: '' }
const usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 }
const turn = (id: string, seq: number, status: TurnRow['status'], error?: string): TurnRow =>
  ({ id, threadId: 'th', seq, status, model: { name: 'm', connection: 'p/m' }, usage, startedAt: '', ...(error && { error }) }) as TurnRow
const item = (id: string, turnId: string, seq: number, fields: Partial<ItemRow>): ItemRow =>
  ({ id, turnId, seq, type: 'agentMessage', status: 'completed', startedAt: '', ...fields }) as ItemRow

describe('threadMarkdown', () => {
  it('writes who said what, a line per call, and how a turn ended', () => {
    const md = threadMarkdown(
      {
        thread,
        hasMore: false,
        turns: [turn('t1', 1, 'completed'), turn('t2', 2, 'failed', 'rate limited')],
        items: [
          item('u1', 't1', 1, { type: 'userMessage', text: 'Why does `go build` fail?', attachments: [{ id: 'a', kind: 'file', name: 'log.txt', mimeType: 'text/plain', size: 3, file: 'a.txt', tokens: 1 }] }),
          item('r1', 't1', 2, { type: 'reasoning', text: 'thinking out loud' }),
          item('c1', 't1', 3, { type: 'toolCall', tool: 'run_command', arguments: '{}', preparedExecution: { cwd: '/w', settingsDigest: '', argumentsDigest: '', program: 'go', args: ['build', './...'] } }),
          item('a1', 't1', 4, { text: 'A missing import.' }),
          item('u2', 't2', 5, { type: 'userMessage', text: 'Fix it' }),
        ],
      },
      words,
    )
    expect(md).toBe(
      [
        '# Fix the build',
        '## You',
        'Why does `go build` fail?',
        'Attachments:\n- log.txt',
        '## Agent',
        '```sh\n$ go build ./...\n```',
        'A missing import.',
        '## You',
        'Fix it',
        '> The turn failed: rate limited',
      ].join('\n\n') + '\n',
    )
  })
})
