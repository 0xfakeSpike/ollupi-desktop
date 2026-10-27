// Answers request_user_input: each question takes an offered option or an
// answer of the user's own. ollupi checks the answers (userinput.Check) and
// reports a refusal as an error notice; the request then stays open.

import type { UserInputAnswer, UserInputQuestion } from '@ollupi/protocol'
import { Button, cn, Input } from '@ollupi/ui'
import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import type { PendingRequest } from '../../domains/requests'
import { useT } from '../../i18n'

export function QuestionsCard({ request }: { request: Extract<PendingRequest, { kind: 'question' }> }) {
  const m = useT()
  const { questions } = request.params
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const complete = questions.every((q) => answers[q.id]?.trim())

  const submit = () => {
    const out: Record<string, UserInputAnswer> = {}
    for (const q of questions) out[q.id] = { answers: [answers[q.id]!.trim()] }
    request.respond(out)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
      {questions.map((q) => (
        <Question key={q.id} question={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
      ))}
      <div className="flex justify-end">
        <Button size="sm" variant="primary" disabled={!complete} onClick={submit}>
          {m.requests.questions.submit}
        </Button>
      </div>
    </div>
  )
}

function Question({ question, value, onChange }: { question: UserInputQuestion; value: string; onChange(v: string): void }) {
  const m = useT()
  const options = question.options ?? []
  const picked = options.some((o) => o.label === value)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion size={15} className="mt-0.5 shrink-0 text-accent" />
        <div>
          {question.header && <div className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{question.header}</div>}
          <div className="selectable text-[13px] text-fg">{question.question}</div>
        </div>
      </div>
      {options.length > 0 && (
        <div className="flex flex-col gap-1.5 pl-6">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.label)}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-[13px] transition',
                value === o.label ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-raised text-fg hover:border-line-strong',
              )}
            >
              <div className="font-medium">{o.label}</div>
              {o.description && <div className="text-xs text-fg-muted">{o.description}</div>}
            </button>
          ))}
        </div>
      )}
      <div className="pl-6">
        <Input placeholder={options.length ? m.requests.questions.ownAnswer : m.requests.questions.answer} value={picked ? '' : value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}
