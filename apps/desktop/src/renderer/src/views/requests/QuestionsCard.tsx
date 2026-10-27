// Answers request_user_input: each question takes an offered option or an
// answer of the user's own. ollupi checks the answers (userinput.Check) and
// reports a refusal as an error notice; the request then stays open.

import type { UserInputAnswer, UserInputQuestion } from '@ollupi/protocol'
import { ActionCard, Button, cn, Input } from '@ollupi/ui'
import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import type { PendingRequest } from '../../domains/requests'
import { useT } from '../../i18n'

export function QuestionsCard({ request }: { request: Extract<PendingRequest, { kind: 'question' }> }) {
  const m = useT()
  const { questions } = request.params
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const answered = questions.filter((q) => answers[q.id]?.trim()).length
  const single = questions.length === 1

  const submit = () => {
    const out: Record<string, UserInputAnswer> = {}
    for (const q of questions) out[q.id] = { answers: [answers[q.id]!.trim()] }
    request.respond(out)
  }

  return (
    <ActionCard
      tone="accent"
      icon={<MessageCircleQuestion size={16} />}
      // One question is the card's own; several are listed under a count.
      title={single ? questions[0]!.question : m.requests.questions.many(questions.length)}
      status={!single && m.requests.questions.progress(answered, questions.length)}
      actions={
        <Button size="sm" variant="primary" disabled={answered < questions.length} onClick={submit}>
          {m.requests.questions.submit}
        </Button>
      }
    >
      <div className="flex flex-col divide-y divide-line">
        {questions.map((q) => (
          <Question
            key={q.id}
            question={q}
            asked={!single}
            value={answers[q.id] ?? ''}
            onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
          />
        ))}
      </div>
    </ActionCard>
  )
}

interface QuestionProps {
  question: UserInputQuestion
  /** Whether to state the question here; a lone one is the card's title. */
  asked: boolean
  value: string
  onChange(v: string): void
}

function Question({ question, asked, value, onChange }: QuestionProps) {
  const m = useT()
  const options = question.options ?? []
  const picked = options.some((o) => o.label === value)
  const own = !!value && !picked
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      {asked && (
        <div>
          {question.header && <div className="text-small text-fg-subtle">{question.header}</div>}
          <div className="selectable text-ui font-medium text-fg">{question.question}</div>
        </div>
      )}
      {options.length > 0 ? (
        <div role="radiogroup" aria-label={question.question} className="-mx-2 flex flex-col">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={value === o.label}
              onClick={() => onChange(o.label)}
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 ease-standard hover:bg-hover',
                'focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none',
                value === o.label && 'bg-hover',
              )}
            >
              <Radio checked={value === o.label} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-ui text-fg">{o.label}</span>
                {o.description && <span className="block text-small text-fg-muted">{o.description}</span>}
              </span>
            </button>
          ))}
          <div className="flex items-center gap-2 px-2 py-1">
            <Radio checked={own} />
            <Input placeholder={m.requests.questions.ownAnswer} value={own ? value : ''} onChange={(e) => onChange(e.target.value)} />
          </div>
        </div>
      ) : (
        <Input placeholder={m.requests.questions.answer} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/** A radio's mark: the one place the card's accent fills a control. */
function Radio({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-100 ease-standard',
        checked ? 'border-accent bg-accent' : 'border-line-strong',
        className,
      )}
    >
      {checked && <span className="size-1.5 rounded-full bg-accent-fg" />}
    </span>
  )
}
