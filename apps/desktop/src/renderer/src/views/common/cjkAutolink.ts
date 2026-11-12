// A bare URL in Chinese is followed by Chinese with no space between, and
// GFM's autolink literal runs on to the next space: "见 https://x.dev/a），然后…"
// turns the whole clause into a link to a page that does not exist. A URL
// has no CJK characters or full-width punctuation in it as written, so a
// literal link ends at the first one, and the rest goes back to text.

interface Node {
  type: string
  value?: string
  url?: string
  children?: Node[]
}

/** CJK ideographs, kana, hangul, and CJK and full-width punctuation. */
const CJK = /[⺀-⿿　-ヿ㐀-䶿一-鿿가-힯豈-﫿︰-﹏＀-￯]/

export function remarkCjkAutolink() {
  return (tree: Node) => split(tree)
}

function split(node: Node): void {
  const children = node.children
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    const text = literal(child)
    const cut = text === undefined ? -1 : text.search(CJK)
    if (text !== undefined && cut > 0) {
      const rest = text.slice(cut)
      const kept = text.slice(0, cut)
      child.children = [{ type: 'text', value: kept }]
      child.url = child.url!.slice(0, child.url!.length - rest.length)
      children.splice(i + 1, 0, { type: 'text', value: rest })
      i++
    } else {
      split(child)
    }
  }
}

/** The text of a link GFM made from a bare URL: one text child that the
 * URL ends with (a www. literal gets http:// put in front). */
function literal(node: Node): string | undefined {
  if (node.type !== 'link' || node.children?.length !== 1) return undefined
  const only = node.children[0]!
  if (only.type !== 'text' || !only.value || !node.url?.endsWith(only.value)) return undefined
  return only.value
}
