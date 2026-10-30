// read_file, glob and grep: the agent looking at files. Each shows what it
// read or found; a path inside the thread's workspace opens in the Files
// panel.

import { readText, type ToolCall } from '@ollupi/core'
import type { GrepFile, ItemRow } from '@ollupi/protocol'
import { Block, cn } from '@ollupi/ui'
import { FileText, FolderSearch, TextSearch } from 'lucide-react'
import { createContext, Fragment, useContext, type ReactNode } from 'react'
import { showFile } from '../../../domains/navigation'
import { useLocale, useT } from '../../../i18n'
import { fileSize } from '../../../i18n/format'
import { CodeBlock } from '../../common/Markdown'
import { CallRow, ErrorText, statusFailure } from './CallRow'
import type { ToolView } from './types'

type Read = Extract<ToolCall, { kind: 'read' }>
type Glob = Extract<ToolCall, { kind: 'glob' }>
type Grep = Extract<ToolCall, { kind: 'grep' }>

/** The workspace of the thread on screen, whose files the Files panel shows. */
export const ThreadWorkspace = createContext<string | undefined>(undefined)

/** ollupi shows a path inside the project relative to its root, and one
 * outside it absolute; only the first is in the Files panel. */
function PathLink({ path }: { path: string }) {
  const workspaceId = useContext(ThreadWorkspace)
  const m = useT()
  if (!workspaceId || path.startsWith('/')) return <span className="selectable font-mono text-small break-all text-fg-muted">{path}</span>
  return (
    <button
      type="button"
      title={m.conversation.tool.openInFiles}
      onClick={() => showFile(workspaceId, path)}
      className="rounded-sm text-left font-mono text-small break-all text-fg-muted hover:text-fg hover:underline focus-visible:ring-3 focus-visible:ring-focus focus-visible:outline-none"
    >
      {path}
    </button>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <div className="text-small text-fg-subtle">{children}</div>
}

export const read: ToolView<Read> = {
  title: (m, call) => m.conversation.tool.readFile(call.output?.path ?? call.args.path),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: ReadCall,
  approval: { title: (m) => m.requests.approval.readFile, Body: () => null },
}

function ReadCall({ item, call }: { item: ItemRow; call: Read }) {
  const m = useT()
  const locale = useLocale((l) => l.locale)
  const o = call.output
  const badge =
    o?.binary ? m.conversation.tool.binaryFile(o.mimeType ?? '', fileSize(locale, o.size))
    : o?.startLine ? m.conversation.tool.lines(o.startLine, o.endLine ?? o.startLine, o.totalLines)
    : undefined
  return (
    <CallRow
      item={item}
      icon={FileText}
      title={<span className="font-mono text-small">{read.title(m, call)}</span>}
      badge={badge && <span className="shrink-0 text-small text-fg-subtle">{badge}</span>}
      failure={read.failure(m, call, item)}
    >
      {o && <PathLink path={o.path} />}
      {o?.text && <CodeBlock code={readText(o)} label={o.path} />}
      {item.error && <ErrorText text={item.error} />}
    </CallRow>
  )
}

export const glob: ToolView<Glob> = {
  title: (m, call) => m.conversation.tool.glob(call.args.pattern, call.output?.path ?? call.args.path ?? '.'),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: GlobCall,
  approval: { title: (m) => m.requests.approval.glob, Body: () => null },
}

function GlobCall({ item, call }: { item: ItemRow; call: Glob }) {
  const m = useT()
  const o = call.output
  const files = o?.files ?? []
  return (
    <CallRow
      item={item}
      icon={FolderSearch}
      title={<span className="font-mono text-small">{glob.title(m, call)}</span>}
      badge={o && <span className="shrink-0 text-small text-fg-subtle">{m.conversation.tool.files(files.length)}</span>}
      failure={glob.failure(m, call, item)}
    >
      {files.length > 0 && (
        <Block>
          <ul className="flex flex-col gap-0.5">
            {files.map((f) => (
              <li key={f}>
                <PathLink path={f} />
              </li>
            ))}
          </ul>
        </Block>
      )}
      {o?.truncated && <Note>{m.conversation.tool.more}</Note>}
      {!!o?.skipped && <Note>{m.conversation.tool.skipped(o.skipped)}</Note>}
      {item.error && <ErrorText text={item.error} />}
    </CallRow>
  )
}

export const grep: ToolView<Grep> = {
  title: (m, call) => m.conversation.tool.grep(call.args.pattern, call.output?.path ?? call.args.path ?? '.'),
  failure: (m, _call, item) => statusFailure(m, item),
  Call: GrepCall,
  approval: { title: (m) => m.requests.approval.grep, Body: () => null },
}

function GrepCall({ item, call }: { item: ItemRow; call: Grep }) {
  const m = useT()
  const o = call.output
  const files = o?.files ?? []
  return (
    <CallRow
      item={item}
      icon={TextSearch}
      title={<span className="font-mono text-small">{grep.title(m, call)}</span>}
      badge={o && <span className="shrink-0 text-small text-fg-subtle">{m.conversation.tool.matches(o.matches, files.length)}</span>}
      failure={grep.failure(m, call, item)}
    >
      {files.map((f) => (
        <GrepMatches key={f.path} file={f} />
      ))}
      {o?.truncated && <Note>{m.conversation.tool.more}</Note>}
      {!!o?.skipped && <Note>{m.conversation.tool.skipped(o.skipped)}</Note>}
      {item.error && <ErrorText text={item.error} />}
    </CallRow>
  )
}

/** A file's matching lines, numbered, with their context dimmed; a gap in
 * the numbers is marked. */
function GrepMatches({ file }: { file: GrepFile }) {
  const lines = file.lines ?? []
  return (
    <Block label={<PathLink path={file.path} />} actions={<span className="tabular-nums">{file.matches}</span>}>
      {lines.length > 0 && (
        <div className="selectable overflow-x-auto font-mono text-small">
          {lines.map((l, i) => (
            <Fragment key={l.line}>
              {i > 0 && l.line > lines[i - 1]!.line + 1 && <div className="text-fg-subtle">⋯</div>}
              <div className={cn('flex gap-3 whitespace-pre', l.match ? 'text-fg' : 'text-fg-subtle')}>
                <span className="w-8 shrink-0 text-right tabular-nums text-fg-subtle">{l.line}</span>
                <span>{l.text}</span>
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </Block>
  )
}
