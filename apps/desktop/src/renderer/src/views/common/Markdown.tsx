// Markdown as the model writes it. Streamdown parses it, and while a
// message is still streaming it closes what is not closed yet (a code
// fence, a table, emphasis), so a block does not flash as plain text before
// it ends. Every element is drawn as its plain tag, styled by .markdown
// from the design tokens, not by Streamdown's own classes. Code is
// highlighted by Shiki in a light and a dark theme, picked by the scheme,
// with its JavaScript regex engine: the page's CSP allows no WebAssembly,
// which the default engine compiles. A diff's added and removed lines are
// marked, for .markdown to shade. A workspace file's links and images
// are relative to its folder, and its images are read from the workspace.

import { Block, IconButton } from '@ollupi/ui'
import { Check, Copy } from 'lucide-react'
import { createContext, createElement, memo, useContext, useEffect, useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import { createHighlighterCore, type HighlighterCore, type ShikiTransformer } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'
import { bundledThemes } from 'shiki/themes'
import { defaultRehypePlugins, defaultRemarkPlugins, Streamdown, useIsCodeFenceIncomplete, type Components, type ExtraProps } from 'streamdown'
import { linkedPath } from '../../domains/filePaths'
import { readImage } from '../../domains/files'
import { run } from '../../gateway/run'
import { useT } from '../../i18n'
import { remarkCjkAutolink } from './cjkAutolink'
import { ReplyPath } from './FileLink'
import { MermaidBlock } from './Mermaid'
import { useNearViewport } from './useNearViewport'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  // A fence still being written is drawn as it is: highlighting it at every
  // token would repeat the work for each one. A finished block waits until
  // it comes near the viewport, since a conversation mounts all of its
  // messages, on screen or not.
  const streaming = useIsCodeFenceIncomplete()
  const { ref, near } = useNearViewport<HTMLDivElement>()
  const html = useHighlighted(near && !streaming ? code : undefined, label)
  return (
    <div ref={ref}>
      <Block label={<span className="font-mono">{label || 'text'}</span>} actions={<CopyButton text={code} />}>
        {html ? (
          // Scrolled across the block's padding, so a shaded line reaches its edges.
          <div className="selectable -mx-3 overflow-x-auto px-3 font-mono text-ui" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="selectable overflow-x-auto font-mono text-ui">
            <code>{code}</code>
          </pre>
        )}
      </Block>
    </div>
  )
}

const themes = { light: 'github-light', dark: 'github-dark' } as const

let highlighter: Promise<HighlighterCore> | undefined

/** One highlighter for the app, with both themes; each language is loaded
 * the first time a block uses it. */
async function highlight(code: string, language: string): Promise<string | undefined> {
  highlighter ??= createHighlighterCore({
    themes: [bundledThemes[themes.light](), bundledThemes[themes.dark]()],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  const h = await highlighter
  const load = (bundledLanguages as Record<string, (typeof bundledLanguages)[keyof typeof bundledLanguages] | undefined>)[language]
  if (!load) return undefined
  if (!h.getLoadedLanguages().includes(language)) await h.loadLanguage(load())
  return h.codeToHtml(code, { lang: language, themes, defaultColor: false, transformers: language === 'diff' ? [diffLines] : [] })
}

/** In a diff, a line starting + was added and one starting - removed. */
const diffLines: ShikiTransformer = {
  pre(node) {
    this.addClassToHast(node, 'diff')
  },
  line(node, line) {
    const first = this.source.split('\n')[line - 1]?.[0]
    if (first === '+') this.addClassToHast(node, 'added')
    if (first === '-') this.addClassToHast(node, 'removed')
  },
}

/** Shiki's HTML for the code, once it has loaded the language; undefined
 * before then, for a language it does not know, and for a block that is
 * not to be drawn yet (still streaming, or off screen). Its output escapes
 * the code, so it is safe to insert. */
function useHighlighted(code: string | undefined, language: string | undefined): string | undefined {
  const [html, setHtml] = useState<string>()
  useEffect(() => {
    if (!code || !language) return setHtml(undefined)
    let current = true
    highlight(code, language)
      .then((h) => current && setHtml(h))
      .catch(() => current && setHtml(undefined))
    return () => {
      current = false
    }
  }, [code, language])
  return html
}

/** label names what is copied; it reads "Copy" by default. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const m = useT()
  return (
    <IconButton
      label={copied ? m.conversation.markdown.copied : (label ?? m.conversation.markdown.copy)}
      size="sm"
      onClick={() =>
        void run((e) => e.copy, async () => {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </IconButton>
  )
}

type Hast = { properties?: { className?: unknown } } | undefined

/** The tag itself, with its children and attributes but none of
 * Streamdown's classes. GFM's sr-only stays: it hides the footnotes'
 * heading, which is there for screen readers. */
const plain =
  (tag: string) =>
  ({ node, className: _className, ...props }: Record<string, unknown>) => {
    const classes = (node as Hast)?.properties?.className
    return createElement(tag, Array.isArray(classes) && classes.includes('sr-only') ? { ...props, className: 'sr-only' } : props)
  }

/** A link within the message (a footnote and the way back) scrolls to its
 * target in this message: every message numbers its footnotes from 1, so
 * the same id is in each. */
function inMessage(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault()
  event.currentTarget.closest('.markdown')?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'strong', 'em', 'del', 'sub', 'sup', 'section']
const tableTags = ['thead', 'tbody', 'tr', 'th', 'td']

const components: Components = {
  ...Object.fromEntries([...tags, ...tableTags].map((t) => [t, plain(t)])),
  table: ({ children }) => <table>{children}</table>,
  // Streamdown's own pre marks its code as a block (data-block), which
  // sends it here rather than to inlineCode.
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className ?? '')?.[1]
    const code = flatten(children).replace(/\n$/, '')
    return language === 'mermaid' ? <MermaidBlock code={code} /> : <CodeBlock code={code} label={language} />
  },
  // Inline code that names a workspace file links to it.
  inlineCode: ({ children }) => (
    <ReplyPath text={flatten(children)}>
      <code>{children}</code>
    </ReplyPath>
  ),
  a: Link,
  img: Image,
}

/** The workspace file a text is, when it is one: root is the workspace's,
 * path the file's within it. version is bumped to read its images again. */
export type MarkdownFile = { root: string; path: string; version?: number }

const InFile = createContext<{ root: string; folder: string; version: number } | undefined>(undefined)

/** Footnote links keep their ids and labels, which screen readers follow. */
function Link({ href, children, node: _node, className: _className, ...props }: ComponentProps<'a'> & ExtraProps) {
  const file = useContext(InFile)
  if (href?.startsWith('#')) {
    return (
      <a {...props} href={href} target={undefined} rel={undefined} onClick={(e) => inMessage(e, decodeURIComponent(href.slice(1)))}>
        {children}
      </a>
    )
  }
  // A link to a workspace file opens it; any other, in the browser.
  const path = !href ? undefined : file ? linkedPath(href, file.folder, file.root) : /^[a-z][\w+.-]*:/i.test(href) ? undefined : safeDecode(href)
  return (
    <ReplyPath
      text={path}
      fallback={
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      }
    >
      {children}
    </ReplyPath>
  )
}

/** An image a workspace file shows from the workspace is read from it; a
 * missing one leaves its description. Any other loads as it is. */
function Image({ src, alt, node: _node, className: _className, ...props }: ComponentProps<'img'> & ExtraProps) {
  const file = useContext(InFile)
  const path = file && typeof src === 'string' ? linkedPath(src, file.folder, file.root) : undefined
  const [read, setRead] = useState<{ path: string; url: string | undefined }>()
  useEffect(() => {
    if (!file || !path) return
    let live = true
    void readImage(file.root, path).then((url) => live && setRead({ path, url }))
    return () => {
      live = false
    }
  }, [file?.root, file?.version, path])
  if (!path) return <img {...props} src={src} alt={alt} />
  if (read?.path !== path) return null
  return read.url ? <img {...props} src={read.url} alt={alt} /> : <span className="text-fg-subtle">{alt || path}</span>
}

const remarkPlugins = [...Object.values(defaultRemarkPlugins), remarkCjkAutolink]
/** A file's own links and images are relative to its folder, which harden
 * rewrites against the page (./a.png to /a.png) or blocks (a.png); sanitize
 * still keeps out what is unsafe. */
const { harden: _harden, ...fileRehype } = defaultRehypePlugins
const fileRehypePlugins = Object.values(fileRehype)

export const Markdown = memo(function Markdown({ text, streaming = false, file }: { text: string; streaming?: boolean; file?: MarkdownFile }) {
  const m = useT().conversation.markdown
  const remarkRehypeOptions = useMemo(() => ({ footnoteLabel: m.footnotes, footnoteBackLabel: m.footnoteBack }), [m])
  const root = file?.root
  const folder = file?.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
  const version = file?.version ?? 0
  const inFile = useMemo(() => (root === undefined ? undefined : { root, folder, version }), [root, folder, version])
  return (
    <InFile.Provider value={inFile}>
      <Streamdown
        className="markdown"
        mode={streaming ? 'streaming' : 'static'}
        components={components}
        controls={false}
        linkSafety={{ enabled: false }}
        remarkPlugins={remarkPlugins}
        rehypePlugins={inFile ? fileRehypePlugins : undefined}
        remarkRehypeOptions={remarkRehypeOptions}
      >
        {text}
      </Streamdown>
    </InFile.Provider>
  )
})

function safeDecode(href: string): string {
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

function flatten(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  return ''
}
