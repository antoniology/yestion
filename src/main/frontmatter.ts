/**
 * The one front-matter parser.
 *
 * There used to be two: this logic lived in both `workspace.ts` (which used an
 * LF-only regex) and `linktree.ts` (which tolerated CRLF but only unquoted once
 * and skipped nothing else). A page written by an editor that used CRLF — or
 * synced from Windows — matched neither consistently, so its title/icon were
 * lost and the `---` block leaked into the body. Same input, same result, one
 * place to fix.
 */

export interface ParsedPage {
  title: string
  icon: string
  body: string
  /** Every key found in the block, values unquoted. */
  frontmatter: Record<string, string>
}

/** `---` <yaml> `---` at the very start of the file. CRLF and an empty block
 *  (`---\n---`) both count. */
const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

export function parsePageFile(content: string, fallbackTitle: string): ParsedPage {
  const m = FRONT_MATTER.exec(content)
  if (!m) return { title: fallbackTitle, icon: '', body: content, frontmatter: {} }
  const frontmatter: Record<string, string> = {}
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    frontmatter[kv[1]] = unquote(kv[2].trim())
  }
  return {
    title: (frontmatter.title ?? '').trim() || fallbackTitle,
    icon: (frontmatter.icon ?? '').trim(),
    body: content.slice(m[0].length),
    frontmatter
  }
}

/**
 * Strip surrounding quotes and unescape. Repeats, so values that older buggy
 * versions double-escaped (`title: "\"Real\""`) heal on the next read.
 */
function unquote(value: string): string {
  let v = value
  for (let i = 0; i < 3; i++) {
    const q = v[0]
    if ((q === '"' || q === "'") && v.length > 1 && v.endsWith(q)) {
      v = v.slice(1, -1)
      if (q === '"') v = v.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else break
  }
  return v
}
