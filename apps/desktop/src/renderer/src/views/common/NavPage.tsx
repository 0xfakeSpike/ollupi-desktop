import type { HTMLAttributes, ReactNode, Ref } from 'react'

/** A screen with categories of its own (memory, capabilities, settings): its
 * title, the categories listed down the left, and the one chosen right
 * beside them. Title, list and column keep to the left of the sheet as one,
 * so a wide window leaves its room on the right, after what is read, never
 * between the sidebar and the list or the list and the column; the title
 * stands over the list it names. The list stays in view while the column
 * scrolls; in a narrow window it is a row of capsules above it. */
export function NavPage({
  title,
  actions,
  nav,
  panel,
  scrollRef,
  children,
}: {
  title: ReactNode
  /** At the title bar's right end, over the column's right edge. */
  actions?: ReactNode
  nav: ReactNode
  /** The column's attributes, e.g. its tabpanel role and label. */
  panel?: HTMLAttributes<HTMLDivElement>
  scrollRef?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  return (
    <div className="@container/page flex h-full flex-col">
      <header className="drag flex h-16 shrink-0 items-center">
        <div className="flex w-full max-w-page items-center gap-3 px-6">
          <h1 className="min-w-0 flex-1 truncate text-title">{title}</h1>
          {actions}
        </div>
      </header>
      {/* One scroll area across the screen, so the wheel works over the margins too. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full max-w-page flex-col @3xl/page:flex-row @3xl/page:items-start">
          {/* Its labels start under the title. */}
          <nav className="sticky top-0 z-10 shrink-0 overflow-x-auto bg-canvas px-3 py-2 [scrollbar-width:none] @3xl/page:w-40 @3xl/page:overflow-x-visible">
            {nav}
          </nav>
          <div {...panel} className="flex min-w-0 flex-1 flex-col gap-5 px-6 pt-3 pb-16">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
