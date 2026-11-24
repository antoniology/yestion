/**
 * Repair pipe tables before the markdown parser sees them.
 *
 * Two things the workspace's own conventions break:
 *
 *  1. The app writes a trailing `\` at the end of a line to mean "real line
 *     break". Applied to a table row that backslash sits after the final pipe
 *     and markdown-it stops recognising the whole block as a table — it lands
 *     on the page as literal pipe text. The table serializer never writes the
 *     backslash itself; files written by an agent that followed the general
 *     line-break rule do.
 *
 *  2. A separator row with fewer `---` cells than the header row is rejected
 *     outright, so a six-column table with five separators is plain text.
 *
 * Both are repaired here, on the way in only. The file on disk is left alone.
 */

const FENCE = /^\s*(`{3,}|~{3,})/
const ROW = /^\s*\|/
const DELIMITER =
  /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** A line without the trailing hard-break backslash. */
function stripTrailingBreak(line: string): string {
  return line.replace(/\\\s*$/, '').replace(/\s+$/, '')
}

/** Cell texts of a pipe row, honouring escaped pipes. */
function cells(line: string): string[] {
  let text = stripTrailingBreak(line).trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  const out: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '|') {
      out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  out.push(current.trim())
  return out
}

function padDelimiter(line: string, count: number): string {
  const existing = cells(line)
  if (existing.length >= count) return line
  const padded = [...existing, ...Array(count - existing.length).fill('---')]
  const lead = /^\s*\|/.test(line) ? '| ' : ''
  const trail = /\|\s*$/.test(line) ? ' |' : ''
  return lead + padded.join(' | ') + trail
}

export function repairTables(markdown: string): string {
  if (!markdown.includes('|')) return markdown
  const lines = markdown.split('\n')
  let inFence = false
  let fenceChar = ''

  for (let i = 0; i < lines.length - 1; i++) {
    const fence = FENCE.exec(lines[i])
    if (fence) {
      const ch = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = ch
      } else if (ch === fenceChar) {
        inFence = false
      }
      continue
    }
    if (inFence) continue
    if (!ROW.test(lines[i])) continue
    if (!DELIMITER.test(stripTrailingBreak(lines[i + 1]))) continue

    const header = stripTrailingBreak(lines[i])
    const columns = cells(header).length
    lines[i] = header
    lines[i + 1] = padDelimiter(stripTrailingBreak(lines[i + 1]), columns)

    // Body rows belong to the same block as long as they start with a pipe.
    let j = i + 2
    while (j < lines.length && ROW.test(lines[j])) {
      lines[j] = stripTrailingBreak(lines[j])
      j++
    }
    i = j - 1
  }

  return lines.join('\n')
}
