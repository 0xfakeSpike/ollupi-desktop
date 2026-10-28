// request_user_input: the questions as a card while they wait, then what
// was asked and answered.

import { waitsForAnswer, type ToolCall } from '@ollupi/core'
import type { ItemRow } from '@ollupi/protocol'
import { ProcessRow } from '@ollupi/ui'
import { MessageCircleQuestion } from 'lucide-react'
import { usePendingRequest } from '../../../domains/requests'
import { useT } from '../../../i18n'
import { duration } from '../../../i18n/format'
import { QuestionsCard } from '../../requests/QuestionsCard'
import { argumentsApproval, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Question = Extract<ToolCall, { kind: 'question' }>

export const question: ToolView<Question> = {
  title: (m) => m.common.tool.question,
  failure: (m, _call, item) => statusFailure(m, item),
  Call: QuestionCall,
  approval: argumentsApproval,
}

function QuestionCall({ item, call }: { item: ItemRow; call: Question }) {
  const request = usePendingRequest(item.id)
  const m = useT()
  if (request?.kind === 'question') return <QuestionsCard request={request} />
  const qa = call.questions
  const answered = qa.every((q) => q.answers)
  const title = answered ? m.conversation.tool.answered(qa.length) : waitsForAnswer(item) ? m.conversation.tool.waitingAnswer : item.error || m.conversation.tool.notAnswered
  return (
    <ProcessRow icon={<MessageCircleQuestion size={14} />} title={title} meta={item.completedAt && duration(m, item.startedAt, item.completedAt)}>
      <dl className="flex flex-col gap-2">
        {qa.map((q) => (
          <div key={q.id}>
            <dt className="text-small text-fg-subtle">{q.question}</dt>
            <dd className="selectable text-ui text-fg">{q.answers?.join(', ') ?? m.conversation.tool.notAnswered}</dd>
          </div>
        ))}
      </dl>
    </ProcessRow>
  )
}
