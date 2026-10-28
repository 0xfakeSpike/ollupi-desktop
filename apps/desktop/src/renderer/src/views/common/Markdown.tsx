// Markdown as the model writes it. Streamdown parses it, and while a
// message is still streaming it closes what is not closed yet (a code
// fence, a table, emphasis), so a block does not flash as plain text before
// it ends. Every element is drawn as its plain tag, styled by .markdown
// from the design tokens, not by Streamdown's own classes. Code is
// highlighted by Shiki in a light and a dark theme, picked by the scheme,
// with its JavaScript regex engine: the page's CSP allows no WebAssembly,
// which the default engine compiles. A diff's added and removed lines are
// marked, for .markdown to shade.

import { Block, IconButton } from '@ollupi/ui'
import { Check, Copy } from 'lucide-react'
import { createElement, memo, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { createHighlighterCore, type HighlighterCore, type ShikiTransformer } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'
import { bundledThemes } from 'shiki/themes'
import { Streamdown, type Components } from 'streamdown'
import { useT } from '../../i18n'
import { MermaidBlock } from './Mermaid'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const html = useHighlighted(code, label)
  return (
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
 * before then and for a language it does not know. Its output escapes the
 * code, so it is safe to insert. */
function useHighlighted(code: string, language: string | undefined): string | undefined {
  const [html, setHtml] = useState<string>()
  useEffect(() => {
    if (!language) return setHtml(undefined)
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

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const m = useT()
  return (
    <IconButton
      label={copied ? m.conversation.markdown.copied : m.conversation.markdown.copy}
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
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

const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'strong', 'em', 'del', 'sub', 'sup', 'img', 'section']
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
  inlineCode: ({ children }) => <code>{children}</code>,
  // Footnote links keep their ids and labels, which screen readers follow.
  a: ({ href, children, node: _node, className: _className, ...props }) =>
    href?.startsWith('#') ? (
      <a {...props} href={href} target={undefined} rel={undefined} onClick={(e) => inMessage(e, decodeURIComponent(href.slice(1)))}>
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
}

export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const m = useT().conversation.markdown
  const remarkRehypeOptions = useMemo(() => ({ footnoteLabel: m.footnotes, footnoteBackLabel: m.footnoteBack }), [m])
  return (
    <Streamdown
      className="markdown"
      mode={streaming ? 'streaming' : 'static'}
      components={components}
      controls={false}
      linkSafety={{ enabled: false }}
      remarkRehypeOptions={remarkRehypeOptions}
    >
      {text}
    </Streamdown>
  )
})

function flatten(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  return ''
}
