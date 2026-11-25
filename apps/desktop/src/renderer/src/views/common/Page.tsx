import type { ReactNode } from 'react'

/** A screen that is one thing (the models, the usage): its title over a
 * line saying what it is for, and the thing below, in a column kept to the
 * left of the sheet as a NavPage keeps its own. */
export function Page({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-16 shrink-0 items-center">
        <div className="flex w-full max-w-page items-center px-6">
          <h1 className="min-w-0 flex-1 truncate text-title">{title}</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full max-w-page flex-col gap-5 px-6 pt-3 pb-16">
          {description && <p className="text-ui text-fg-muted">{description}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
