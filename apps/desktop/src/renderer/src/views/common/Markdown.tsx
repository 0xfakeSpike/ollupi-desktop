import { Block, IconButton } from '@ollupi/ui'
import { Check, Copy } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT } from '../../i18n'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Block label={<span className="font-mono">{label || 'text'}</span>} actions={<CopyButton text={code} />}>
      <pre className="selectable overflow-x-auto font-mono text-ui">
        <code>{code}</code>
      </pre>
    </Block>
  )
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

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className ?? '')?.[1]
    const text = flatten(children)
    // Fenced blocks carry a language or span lines; the rest is inline code.
    if (language || text.includes('\n')) return <CodeBlock code={text.replace(/\n$/, '')} label={language} />
    return <code>{children}</code>
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

function flatten(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  return ''
}
