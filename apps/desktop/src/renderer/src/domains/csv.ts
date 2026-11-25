// A CSV or TSV file read into rows, as RFC 4180 writes them: a field in
// double quotes may hold the separator, a line break, or a quote doubled.

/** The separator a file's name says it uses, or undefined for a file that is no table. */
export function separatorOf(path: string): string | undefined {
  const ext = /\.(csv|tsv)$/i.exec(path)?.[1]?.toLowerCase()
  return ext === 'csv' ? ',' : ext === 'tsv' ? '\t' : undefined
}

/** The rows of a table's text, each as long as the longest, so every
 * column lines up. truncated drops the last row, which the cut may have
 * split. A byte-order mark at the start, as Excel writes, is no part of
 * the first field. */
export function parseTable(text: string, separator: string, truncated = false): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const endRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }
  for (; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') (field += '"'), i++
      else quoted = false
    } else if (c === '"' && field === '') quoted = true
    else if (c === separator) row.push(field), (field = '')
    else if (c === '\n') endRow()
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else field += c
  }
  // The last line has no break after it, unless the file ends in one.
  if (field !== '' || row.length > 0 || quoted) endRow()
  if (truncated) rows.pop()
  const width = Math.max(0, ...rows.map((r) => r.length))
  return rows.map((r) => (r.length < width ? [...r, ...Array<string>(width - r.length).fill('')] : r))
}
