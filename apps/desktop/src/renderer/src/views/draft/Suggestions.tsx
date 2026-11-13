// Things to start with, under the greeting of a new conversation, so the box
// is not the only way in (PRODUCT.md principle 0). Each comes from what the
// person really has: the folder they chose, a skill they installed, and what
// Ollupi itself does unasked (scheduled tasks, the browser, memory). A card
// writes its words into the empty box to be finished or changed; nothing is
// sent. They show only while the box is empty.

import { useEffect, useState } from 'react'
import { NEW_CONVERSATION, suggestDraft, useDraft } from '../../domains/drafts'
import { readSkills, useLoadedSkills } from '../../domains/skills'
import { useT } from '../../i18n'
import { cn } from '@ollupi/ui'
import { areaClass } from '../common/areas'

interface Suggestion {
  key: string
  /** Where it comes from, said small above it. */
  source: string
  /** The dot before the source: a workspace's area colour, or an area hue. */
  dot: string
  /** What the card says. */
  text: string
  /** What it writes into the box. */
  start: string
}

/** A skill's description up to its first sentence: the rest is for the agent. */
const firstSentence = (s: string) => s.split(/(?<=[。.!！?？])\s*|\n/)[0]?.trim() ?? s

export function Suggestions({ workspace }: { workspace: { id: string; name: string } | undefined }) {
  const t = useT().conversation.draft.suggest
  const draft = useDraft(NEW_CONVERSATION)
  const loaded = useLoadedSkills()
  const [skill, setSkill] = useState<{ name: string; description: string }>()
  // One installed skill, chosen once for this visit.
  useEffect(() => {
    if (!loaded?.length) return
    let live = true
    void readSkills().then((list) => {
      if (!live || !list?.ok) return
      const usable = list.skills.filter((s) => loaded.includes(s.name))
      if (usable.length) setSkill(usable[Math.floor(Math.random() * usable.length)])
    })
    return () => {
      live = false
    }
  }, [loaded?.join('\n')])

  if (draft.text.trim() || draft.attachments.length) return null
  const cards: Suggestion[] = [
    ...(workspace ? [{ key: 'folder', source: t.folderSource, dot: areaClass(workspace.id), text: t.folder(workspace.name), start: t.folder(workspace.name) }] : []),
    ...(skill ? [{ key: 'skill', source: t.skillSource(skill.name), dot: 'bg-area-3', text: firstSentence(skill.description), start: t.skillStart(skill.name) }] : []),
    { key: 'cron', source: t.cronSource, dot: 'bg-area-1', text: t.cron, start: t.cron },
    { key: 'browser', source: t.browserSource, dot: 'bg-area-4', text: t.browser, start: t.browserStart },
    { key: 'memory', source: t.memorySource, dot: 'bg-area-5', text: t.memory, start: t.memoryStart },
  ].slice(0, 4)

  return (
    <ul aria-label={t.label} className="mt-6 grid w-full max-w-thread grid-cols-2 gap-3 px-6 @3xl/screen:grid-cols-4">
      {/* A narrow screen shows two, in one row, so the box stays in view. */}
      {cards.map((c, i) => (
        <li key={c.key} className={cn(i >= 2 && 'hidden @3xl/screen:block')}>
          <button
            type="button"
            onClick={() => suggestDraft(NEW_CONVERSATION, c.start)}
            className="group flex h-full min-h-32 w-full flex-col gap-2 rounded-3xl bg-surface px-4 pt-3.5 pb-3 text-left transition-colors duration-100 ease-standard hover:bg-selected focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', c.dot)} />
              <span className="truncate">{c.source}</span>
            </span>
            <span className="line-clamp-3 text-ui font-medium text-fg">{c.text}</span>
            <span className="mt-auto self-end rounded-full bg-canvas px-2.5 text-caption leading-6 font-semibold text-fg-muted group-hover:text-fg">{t.try}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
