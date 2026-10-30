// A whole thread as Markdown, to keep or share: what the person sent, what
// the agent answered, and one line for each call it made (a command, a
// file edit, a question asked...). Reasoning stays out; the JSON export has
// everything.

import { callOf, commandLine, createsFile, groupByTurn, type Timeline } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'

export interface MarkdownWords {
  title: string
  you: string
  agent: string
  attachments: string
  plan: string
  subagent: (task: string) => string
  answered: (answer: string) => string
  failed: string
  stopped: string
}

export function threadMarkdown(t: Timeline, w: MarkdownWords): string {
  const out = [`# ${w.title}`]
  for (const { turn, items } of groupByTurn(t)) {
    let speaker: 'you' | 'agent' | undefined
    const say = (who: 'you' | 'agent') => {
      if (speaker !== who) out.push(`## ${who === 'you' ? w.you : w.agent}`)
      speaker = who
    }
    for (const item of items) {
      switch (item.type) {
        case 'userMessage':
          say('you')
          if (item.text) out.push(item.text)
          if (item.attachments?.length) out.push(`${w.attachments}:\n${item.attachments.map((a) => `- ${a.name}`).join('\n')}`)
          break
        case 'agentMessage':
          if (!item.text) break
          say('agent')
          out.push(item.text)
          break
        case 'toolCall': {
          say('agent')
          out.push(callLine(item, w))
          break
        }
        case 'error':
          if (item.text) out.push(`> ${item.text}`)
          break
      }
    }
    if (turn.status === 'failed') out.push(`> ${w.failed}${turn.error ? `: ${turn.error}` : ''}`)
    if (turn.status === 'interrupted') out.push(`> ${w.stopped}`)
  }
  return out.join('\n\n') + '\n'
}

function callLine(item: ItemRow, w: MarkdownWords): string {
  const call = callOf(item)
  switch (call.kind) {
    case 'command':
      return fence('sh', `$ ${commandLine(call.command)}`)
    case 'file':
      return `${createsFile(call.change) ? '+' : '~'} \`${call.change.path}\`\n\n${fence('diff', call.change.diff)}`
    case 'plan':
      return `${w.plan}:\n${call.plan.plan.map((s) => `- [${s.status === 'completed' ? 'x' : ' '}] ${s.step}`).join('\n')}`
    case 'question':
      return call.questions.map((q) => `> ${q.question}${q.answers?.length ? `\n>\n> ${w.answered(q.answers.join(', '))}` : ''}`).join('\n\n')
    case 'subagent':
      return `> ${w.subagent(call.task.description)}`
    case 'tool':
      return `\`${call.name ?? item.tool ?? ''}\``
  }
}

/** A fence longer than any backtick run inside, so the text cannot close it. */
function fence(lang: string, text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${text.replace(/\n$/, '')}\n${ticks}`
}
