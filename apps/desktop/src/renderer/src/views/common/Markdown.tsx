// Markdown as the model writes it. Streamdown parses it, and while a
// message is still streaming it closes what is not closed yet (a code
// fence, a table, emphasis), so a block does not flash as plain text before
// it ends. Every element is drawn as its plain tag, styled by .markdown
// from the design tokens, not by Streamdown's own classes. Code is
// highlighted by Shiki in a light and a dark theme, picked by the scheme,
// with its JavaScript regex engine: the page's CSP allows no WebAssembly,
// which the default engine compiles.

import { Block, IconButton } from '@ollupi/ui'
import { Check, Copy } from 'lucide-react'
import { createElement, memo, useEffect, useState, type ReactNode } from 'react'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
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
        <div className="selectable overflow-x-auto font-mono text-ui" dangerouslySetInnerHTML={{ __html: html }} />
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
  return h.codeToHtml(code, { lang: language, themes, defaultColor: false })
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

/** The tag itself, with its children and attributes but none of
 * Streamdown's classes. */
const plain =
  (tag: string) =>
  ({ node: _node, className: _className, ...props }: Record<string, unknown>) =>
    createElement(tag, props)

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
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <Streamdown
      className="markdown"
      mode={streaming ? 'streaming' : 'static'}
      components={components}
      controls={false}
      linkSafety={{ enabled: false }}
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
