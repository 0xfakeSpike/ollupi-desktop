// Text with the words a search matched marked, as ollupi matches them:
// each word anywhere, ignoring case.

import { Fragment } from 'react'

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return (
    <>
      {text.split(pattern).map((part, i) =>
        // split keeps the matches at the odd indexes.
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
