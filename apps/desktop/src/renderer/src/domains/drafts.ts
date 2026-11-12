// What a message box holds before it is sent. It lives outside the screen
// that shows the box, so leaving a conversation — to look at another one, or
// to start a new one — does not throw away what was typed there: each
// conversation keeps its own draft, and the new-conversation page keeps one
// that no thread owns yet. The text is also written to sessionStorage, so
// reloading the interface keeps it; a file picked or pasted belongs to the
// window and cannot outlive a reload.

import { create } from 'zustand'
import { draftAttachment, releaseDraft, type DraftAttachment } from './attachments'

/** A message before it is sent: its text and the files that go with it. */
export interface Draft {
  text: string
  attachments: DraftAttachment[]
}

/** The new-conversation page's box, which no thread owns yet. */
export const NEW_CONVERSATION = 'new-conversation'

/** The box of a conversation nobody is writing in yet. */
const NOTHING: Draft = { text: '', attachments: [] }

/** Draft text as sessionStorage keeps it: by key, text only. */
const STORE_KEY = 'ollupi.drafts'

/** The boxes' drafts, by key, and how many times each box was given a sent
 * message back to edit (reopenDraft), which is the box's cue to take the
 * focus. The functions below are how they change. */
export const useDrafts = create<{ drafts: Record<string, Draft>; reopened: Record<string, number> }>()(() => ({ drafts: {}, reopened: {} }))

/** Writes each box's text to the window's sessionStorage, where a reload
 * finds it. A full or missing storage leaves today's draft in memory. */
function remember(drafts: Record<string, Draft>): void {
  const texts = Object.fromEntries(Object.entries(drafts).flatMap(([key, d]) => (d.text ? [[key, d.text]] : [])))
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(texts))
  } catch {
    // Nothing to do: the draft still lives as long as the window does.
  }
}

function keptTexts(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}')
    if (!kept || typeof kept !== 'object') return {}
    return Object.fromEntries(Object.entries(kept).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''))
  } catch {
    return {}
  }
}

/** Puts back the text a reload left in the boxes; the files that were with
 * it do not come back. Called once when the window loads, like
 * startNavigation. */
export function startDrafts(): void {
  const drafts = Object.fromEntries(
    Object.entries(keptTexts()).map(([key, text]): [string, Draft] => [key, { text, attachments: [] }]),
  )
  useDrafts.setState((s) => ({ drafts: { ...drafts, ...s.drafts } }))
}

/** A box's draft, empty until something is typed in it. */
export function draftOf(key: string): Draft {
  return useDrafts.getState().drafts[key] ?? NOTHING
}

/** A box's draft, followed as it changes. */
export function useDraft(key: string): Draft {
  return useDrafts((s) => s.drafts[key]) ?? NOTHING
}

function update(key: string, fn: (draft: Draft) => Draft): void {
  const drafts = { ...useDrafts.getState().drafts }
  const next = fn(drafts[key] ?? NOTHING)
  // A box left empty is no draft at all: nothing to keep, nothing to restore.
  if (next.text || next.attachments.length) drafts[key] = next
  else delete drafts[key]
  useDrafts.setState({ drafts })
  remember(drafts)
}

export function setDraftText(key: string, text: string): void {
  update(key, (d) => ({ ...d, text }))
}

export function addDraftFiles(key: string, files: Iterable<File>): void {
  const added = Array.from(files, draftAttachment)
  if (added.length) update(key, (d) => ({ ...d, attachments: [...d.attachments, ...added] }))
}

export function removeDraftAttachment(key: string, id: string): void {
  const gone = draftOf(key).attachments.filter((a) => a.id === id)
  gone.forEach(releaseDraft)
  if (gone.length) update(key, (d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) }))
}

/** The box was sent: what went leaves it, and anything typed or attached
 * while it went stays for the next message. The text stays too if it has
 * changed since it was sent. */
export function sentDraft(key: string, sent: Pick<Draft, 'text' | 'attachments'>): void {
  const gone = draftOf(key).attachments.filter((a) => sent.attachments.includes(a))
  gone.forEach(releaseDraft)
  update(key, (d) => ({
    text: d.text === sent.text ? '' : d.text,
    attachments: d.attachments.filter((a) => !sent.attachments.includes(a)),
  }))
}

/** A sent message given back to its box to be written again: its text goes
 * before whatever the box held and its files after the box's, so nothing
 * typed there meanwhile is lost. */
export function reopenDraft(key: string, text: string, files: readonly File[]): void {
  const added = files.map(draftAttachment)
  update(key, (d) => ({
    text: [text, d.text].filter(Boolean).join('\n\n'),
    attachments: [...d.attachments, ...added],
  }))
  const { reopened } = useDrafts.getState()
  useDrafts.setState({ reopened: { ...reopened, [key]: (reopened[key] ?? 0) + 1 } })
}

/** Drops a box's draft and its previews: the conversation it was for is
 * gone. An archived conversation keeps its draft, for its return. */
export function forgetDraft(key: string): void {
  const draft = useDrafts.getState().drafts[key]
  if (!draft) return
  draft.attachments.forEach(releaseDraft)
  const { [key]: _gone, ...rest } = useDrafts.getState().drafts
  useDrafts.setState({ drafts: rest })
  remember(rest)
}
