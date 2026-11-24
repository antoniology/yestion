import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { relaxCjkEmphasis } from './emphasis'
import { repairTables } from './tables'

// Full markdown rendering for agent replies: headings, lists, tables, quotes,
// code fences, links, and KaTeX math ($…$ inline, $$…$$ display) — the same
// syntax the editor understands. HTML is escaped (html:false) since model
// output is untrusted.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})

function renderMath(tex: string, displayMode: boolean): string {
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html'
    })
    return displayMode
      ? `<span class="agent-math-block">${html}</span>`
      : `<span class="agent-math">${html}</span>`
  } catch {
    return `<code>${md.utils.escapeHtml(tex)}</code>`
  }
}

// $…$ inline (not $$, no newlines, must be balanced on the same line)
md.inline.ruler.before('escape', 'agent_math_inline', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false
  if (state.src.charCodeAt(state.pos + 1) === 0x24) return false
  const end = state.src.indexOf('$', state.pos + 1)
  if (end < 0 || end >= state.posMax) return false
  const tex = state.src.slice(state.pos + 1, end)
  if (!tex.trim() || tex.includes('\n')) return false
  if (!silent) {
    const token = state.push('agent_math_inline', 'span', 0)
    token.content = tex
  }
  state.pos = end + 1
  return true
})
md.renderer.rules.agent_math_inline = (tokens, idx) => renderMath(tokens[idx].content, false)

// $$…$$ display math (single or multi line)
md.block.ruler.before('fence', 'agent_math_block', (state, startLine, endLine, silent) => {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  const line = state.src.slice(pos, max)
  if (!line.startsWith('$$')) return false
  let body = line.slice(2)
  let nextLine = startLine
  const closeOnFirst = body.indexOf('$$')
  if (closeOnFirst >= 0) {
    body = body.slice(0, closeOnFirst)
  } else {
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      const p = state.bMarks[nextLine] + state.tShift[nextLine]
      const m = state.eMarks[nextLine]
      const text = state.src.slice(p, m)
      const close = text.indexOf('$$')
      if (close >= 0) {
        body += '\n' + text.slice(0, close)
        break
      }
      body += '\n' + text
    }
    if (nextLine >= endLine) return false // never closed → treat as text
  }
  if (silent) return true
  const token = state.push('agent_math_block', 'span', 0)
  token.content = body.trim()
  token.map = [startLine, nextLine + 1]
  state.line = nextLine + 1
  return true
})
md.renderer.rules.agent_math_block = (tokens, idx) => renderMath(tokens[idx].content, true)

export function renderAgentMarkdown(source: string): string {
  return md.render(repairTables(relaxCjkEmphasis(source ?? '')))
}

export function renderAgentInline(source: string): string {
  return md.renderInline(repairTables(relaxCjkEmphasis(source ?? '')))
}
