/**
 * qz.ts — the `.qz` quiz format.
 *
 * Pure TypeScript: no imports at all, no DOM, no Electron, no path aliases. That
 * keeps it movable to `src/shared/` the day the main process needs the question
 * model — today that move would cost four config edits and a new top-level
 * concept, for a benefit nothing needs yet.
 *
 * Front matter is NOT parsed here. The main process already splits it off with
 * `parsePageFile` and the renderer receives `title` / `icon` / `body` as separate
 * fields, so parsing starts at the descriptor tags.
 *
 * Robustness is a design requirement, not a nicety: these files are hand-written
 * and agent-written. An unknown question type degrades to a free response rather
 * than being dropped, an unknown descriptor key is ignored, a malformed duration
 * is an error rather than a crash, and every `<…>` tag is stripped before any
 * markdown renderer sees a body — `renderAgentMarkdown` runs markdown-it with
 * `html: false`, so a leaked `<q:mcq>` would render as literal escaped text.
 */

export type QzPaperType = 'exam' | 'quiz' | 'flashcard'
export type QzPageMode = 'cont' | 'sep'
export type QzTimingKind = 'none' | 'total' | 'individual'

export type QzQuestionType =
  | 'mcq'
  | 'tf'
  | 'blank'
  | 'short'
  | 'long'
  | 'num'
  | 'match'
  | 'order'
  | 'card'
  | 'free'

/** How a question's answer is assessed. */
export type QzGradeMode = 'auto' | 'ai' | 'self' | 'none'

export interface QzParseError {
  /** 1-based, relative to the body (front matter excluded). */
  line: number
  message: string
}

export interface QzOption {
  text: string
  correct: boolean
}

export interface QzPair {
  left: string
  right: string
}

export interface QzQuestion {
  /** Stable within a paper; index-based (`q1`, `q2`, …). Used to key answers. */
  id: string
  type: QzQuestionType
  /** The type exactly as written, before any fallback to `free`. */
  rawType: string
  marks: number
  /** Per-question limit, meaningful only when `timing === 'individual'`. */
  timeMs: number | null
  passageId: string | null
  grade: QzGradeMode
  /** Markdown, every `<…>` tag stripped. */
  prompt: string

  // Per-type payloads. Presence is driven by `type`.
  options?: QzOption[]
  multi?: boolean
  /** `short` model answer, or `card` back. Markdown. */
  answer?: string
  /** `long` marking scheme — shown as a checklist, or handed to the grader. */
  rubric?: string
  tfAnswer?: boolean | null
  /** `blank`: one entry per gap, each a list of accepted alternatives. */
  blanks?: string[][]
  numAnswer?: number | null
  numUnit?: string
  numTolerance?: number
  pairs?: QzPair[]
  items?: string[]
  /** Per-question override of the paper's scoring rule. */
  scoring?: QzScoreRule | null
}

/**
 * Rule-based scoring for objective questions: what a correct answer, a wrong
 * answer and a blank answer are worth. Fields are optional so a question can
 * override just one of them.
 */
export interface QzScoreRule {
  correct?: number | null
  wrong?: number | null
  blank?: number | null
}

export interface QzPassage {
  id: string
  body: string
}

export interface QzDoc {
  paperType: QzPaperType
  pageMode: QzPageMode
  timing: QzTimingKind
  /** Set only when `timing === 'total'`. */
  totalMs: number | null
  usesPassages: boolean
  /** Markdown intro, or '' when the file declares none. */
  intro: string
  /** Paper-wide scoring rule, or null for per-question marks as written. */
  scoring: QzScoreRule | null
  passages: QzPassage[]
  questions: QzQuestion[]
  errors: QzParseError[]
}

// ---------------------------------------------------------------------------
// Tag grammar
// ---------------------------------------------------------------------------

const RE_DESCRIPTOR = /^<([A-Za-z][A-Za-z0-9_-]*)\s*=\s*([^>]*)>\s*$/
const RE_OPEN_TEXT = /^<text>\s*$/
const RE_CLOSE_TEXT = /^<\/text>\s*$/
const RE_OPEN_SCORING = /^<scoring>\s*$/
const RE_CLOSE_SCORING = /^<\/scoring>\s*$/
const RE_OPEN_PASSAGE = /^<passage\s*:\s*([A-Za-z0-9_-]+)\s*>\s*$/
const RE_CLOSE_PASSAGE = /^<\/passage>\s*$/
const RE_OPEN_Q = /^<q\s*:\s*([A-Za-z0-9_-]+)\s*([^>]*)>\s*$/
const RE_CLOSE_Q = /^<\/q>\s*$/

const RE_ATTR = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^\s>]+))/g

const RE_MCQ_OPTION = /^\s*[-*]\s*\[([ xX])\]\s*(.*)$/
const RE_ORDER_ITEM = /^\s*\d+[.)]\s+(.*)$/
const RE_MATCH_PAIR = /^\s*[-*]\s*(.*?)\s*::\s*(.*)$/
const RE_BLANK = /\{\{([^}]*)\}\}/g
const RE_ANY_TAG = /<\/?[A-Za-z][^>]*>/g
/** Media a question may carry. Deliberately narrow: SVG diagrams and images. */
const RE_MEDIA_TAG = /<svg\b[\s\S]*?<\/svg\s*>|<img\b[^>]*?\/?>/gi
const MEDIA_SENTINEL = '\u0000qzmedia\u0000'

/** Every tag out, so a markdown renderer never sees one. */
export function stripQzTags(text: string): string {
  return text.replace(RE_ANY_TAG, '')
}

/**
 * Strip the paper's tags but keep inline `<svg>` and `<img>`.
 *
 * A question may carry a diagram; the runner extracts those before its own
 * markdown pass (which would escape them). Everything else is still stripped,
 * so a stray `<q:…>` can never reach a renderer.
 */
export function stripQzTagsKeepMedia(text: string): string {
  const media: string[] = []
  const marked = text.replace(RE_MEDIA_TAG, (raw) => {
    media.push(raw)
    return `${MEDIA_SENTINEL}${media.length - 1}\u0000`
  })
  return marked.replace(RE_ANY_TAG, '').replace(/\u0000qzmedia\u0000(\d+)\u0000/g, (_, i) => media[Number(i)] ?? '')
}

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

/**
 * `90m`, `45s`, `1h30m`, `2h`, or a bare number read as minutes.
 * Returns null when malformed — the caller records a parse error and treats the
 * paper as untimed rather than refusing to open it.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 60_000)

  let totalMs = 0
  let consumed = 0
  const re = /(\d+(?:\.\d+)?)\s*(h|m|s)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[1])
    if (m[2] === 'h') totalMs += value * 3_600_000
    else if (m[2] === 'm') totalMs += value * 60_000
    else totalMs += value * 1_000
    consumed += m[0].length
  }
  // Reject trailing junk like "90 minutes" so it fails loudly instead of
  // silently reading as 90m.
  if (consumed === 0 || text.replace(/\s+/g, '').length !== consumed) return null
  return Math.round(totalMs)
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// ---------------------------------------------------------------------------
// Grading defaults
// ---------------------------------------------------------------------------

const AUTO_MARKED: QzQuestionType[] = ['mcq', 'tf', 'blank', 'num', 'match', 'order']

export function isAutoMarked(type: QzQuestionType): boolean {
  return AUTO_MARKED.includes(type)
}

/**
 * Whether a question is answered in free text and has to be judged rather than
 * matched — the set the AI grader is offered for.
 */
export function isAiMarked(type: QzQuestionType): boolean {
  return type === 'long' || type === 'free'
}

/**
 * Anything the runner can match exactly is `auto`; a flashcard has no answer to
 * mark at all; and everything else is written in prose and gets judged.
 *
 * `short` used to be self-marked when it had a model answer — the reasoning
 * being that a stated law is objective enough that ticking it beats a model
 * round-trip. That was wrong in practice: "state Newton's second law" has no
 * fixed wording, and a candidate who wrote it in their own words was being
 * asked to mark themselves against prose they had just written. The `<answer>`
 * is a rubric whether the question says `short` or `long`, so the grader gets it
 * either way. `grade=self` is still there for anyone who wants the tick-box.
 */
export function defaultGrade(type: QzQuestionType): QzGradeMode {
  if (isAutoMarked(type)) return 'auto'
  if (type === 'card') return 'none'
  return 'ai'
}

/**
 * The effective scoring rule for one objective question, or null when the paper
 * uses plain per-question marks. Per-question values win over the paper's, and
 * `correct` falls back to the question's own `marks`.
 */
export function resolveScoring(
  doc: QzDoc,
  q: QzQuestion,
): { correct: number; wrong: number; blank: number } | null {
  // Rule scoring describes objective questions. Prose is marked against its
  // own rubric and keeps its own `marks`.
  if (!isAutoMarked(q.type)) return null
  const base = doc.scoring
  const own = q.scoring
  if (!base && !own) return null
  return {
    correct: own?.correct ?? base?.correct ?? q.marks,
    wrong: own?.wrong ?? base?.wrong ?? 0,
    blank: own?.blank ?? base?.blank ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface SiblingTags {
  values: Record<string, string | null>
  /** 1-based line each tag opened on, for error reporting. */
  lines: Record<string, number | null>
  /** Lines with every extracted tag removed — the prompt. */
  rest: string[]
}

/**
 * Pull a set of sibling tags out of one question body, in both the single-line
 * (`<answer>false</answer>`) and multi-line forms.
 *
 * A tag that opens but never closes ends when the next sibling opens. Without
 * that rule `<answer>6` on one line followed by `<unit>N</unit>` swallows the
 * unit into the answer, and every numeric question reads as unanswerable.
 */
function extractSiblings(input: string[], offset: number, names: string[]): SiblingTags {
  const openRes = names.map((n) => new RegExp(`^<${n}>\\s*(.*)$`))
  const closeRes = names.map((n) => new RegExp(`^(.*?)</${n}>\\s*$`))
  const anyOpen = new RegExp(`^<(${names.join('|')})>`)

  const values: Record<string, string | null> = {}
  const lines: Record<string, number | null> = {}
  for (const n of names) {
    values[n] = null
    lines[n] = null
  }

  const rest: string[] = []
  let current: number | null = null
  let buffer = ''

  const flush = (): void => {
    if (current === null) return
    values[names[current]] = buffer.trim()
    current = null
    buffer = ''
  }

  for (let i = 0; i < input.length; i++) {
    const line = input[i]

    if (current !== null) {
      const closed = line.match(closeRes[current])
      if (closed) {
        buffer += (buffer ? '\n' : '') + closed[1]
        flush()
        continue
      }
      // Unterminated: the next sibling opening is what ends it.
      if (!anyOpen.test(line)) {
        buffer += (buffer ? '\n' : '') + line
        continue
      }
      flush()
    }

    let opened = false
    for (let n = 0; n < names.length; n++) {
      const open = line.match(openRes[n])
      if (!open) continue
      opened = true
      lines[names[n]] = offset + i
      const inline = open[1].trim()
      const sameLine = inline.match(closeRes[n])
      if (sameLine) values[names[n]] = sameLine[1].trim()
      else {
        current = n
        buffer = inline
      }
      break
    }
    if (!opened) rest.push(line)
  }

  flush()
  return { values, lines, rest }
}

function parseAttrs(input: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  RE_ATTR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_ATTR.exec(input)) !== null) {
    attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').trim()
  }
  return attrs
}

function parseBool(input: string): boolean | null {
  const v = input.trim().toLowerCase()
  if (v === 'true' || v === 'yes' || v === 't') return true
  if (v === 'false' || v === 'no' || v === 'f') return false
  return null
}

function parseGrade(input: string): QzGradeMode | null {
  const v = input.trim().toLowerCase()
  if (v === 'auto' || v === 'ai' || v === 'self' || v === 'none') return v
  return null
}

/**
 * Read a `<scoring>` block: `correct = 6`, `wrong = 0`, `blank = 1.5`.
 * A colon works too, negatives are allowed (a contest may penalise a wrong
 * answer), and unknown keys are ignored rather than fatal.
 */
function parseScoreRule(
  lines: string[],
  openLine: number,
  errors: QzParseError[],
): QzScoreRule {
  const rule: QzScoreRule = {}
  lines.forEach((line, i) => {
    const text = line.trim()
    if (!text || text.startsWith('#') || text.startsWith('//')) return
    const m = /^([A-Za-z]+)\s*[=:]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
    if (!m) {
      errors.push({
        line: openLine + 1 + i,
        message: `unreadable scoring rule "${text}" — expected "correct = 6"`,
      })
      return
    }
    const key = m[1].toLowerCase()
    if (key !== 'correct' && key !== 'wrong' && key !== 'blank') return
    rule[key as 'correct' | 'wrong' | 'blank'] = Number(m[2])
  })
  return rule
}

function parseQuestion(
  rawType: string,
  attrStr: string,
  rawBody: string,
  openLine: number,
  errors: QzParseError[],
): QzQuestion {
  const attrs = parseAttrs(attrStr)
  const lines = rawBody.split('\n')

  const tags = extractSiblings(lines, openLine, ['answer', 'unit', 'tolerance'])
  const bodyLines = tags.rest
  const answer = tags.values.answer
  const unit = tags.values.unit ?? ''
  const tolerance = tags.values.tolerance

  const marks = Number.isFinite(Number(attrs.marks)) && attrs.marks !== undefined
    ? Math.max(0, Number(attrs.marks))
    : 1

  let timeMs: number | null = null
  if (attrs.time !== undefined) {
    const parsed = parseDuration(attrs.time)
    if (parsed === null) {
      errors.push({ line: openLine, message: `unreadable time "${attrs.time}" — question is untimed` })
    } else {
      timeMs = parsed
    }
  }

  const normalized = rawType.toLowerCase()
  const known: QzQuestionType[] = [
    'mcq', 'tf', 'blank', 'short', 'long', 'num', 'match', 'order', 'card', 'free',
  ]
  const type: QzQuestionType = (known as string[]).includes(normalized)
    ? (normalized as QzQuestionType)
    : 'free'

  if (type === 'free' && normalized !== 'free') {
    errors.push({
      line: openLine,
      message: `unknown question type "${rawType}" — rendered as a free response`,
    })
  }

  const q: QzQuestion = {
    id: '',
    type,
    rawType,
    marks,
    timeMs,
    passageId: attrs.passage ? attrs.passage.trim() : null,
    grade: 'auto',
    prompt: '',
  }

  let promptLines = bodyLines

  if (type === 'mcq') {
    const options: QzOption[] = []
    const stem: string[] = []
    for (const line of bodyLines) {
      const opt = line.match(RE_MCQ_OPTION)
      if (opt) options.push({ text: opt[2].trim(), correct: opt[1].toLowerCase() === 'x' })
      else stem.push(line)
    }
    if (options.length < 2) {
      errors.push({ line: openLine, message: 'an mcq needs at least two options' })
    }
    q.options = options
    q.multi = options.filter((o) => o.correct).length > 1
    if (!options.some((o) => o.correct)) {
      errors.push({ line: openLine, message: 'no option is marked correct — use "- [x]"' })
    }
    promptLines = stem
  } else if (type === 'tf') {
    q.tfAnswer = answer === null ? null : parseBool(answer)
    if (answer !== null && q.tfAnswer === null) {
      errors.push({ line: tags.lines.answer ?? openLine, message: 'answer must be true or false' })
    }
  } else if (type === 'blank') {
    const blanks: string[][] = []
    RE_BLANK.lastIndex = 0
    const joined = bodyLines.join('\n')
    let m: RegExpExecArray | null
    while ((m = RE_BLANK.exec(joined)) !== null) {
      blanks.push(
        m[1]
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    }
    if (blanks.length === 0) {
      errors.push({ line: openLine, message: 'no {{blank}} found in a fill-in-the-blank question' })
    }
    q.blanks = blanks
  } else if (type === 'short' || type === 'card') {
    q.answer = answer ?? ''
    if (answer === null && type === 'card') {
      errors.push({ line: openLine, message: 'a flashcard needs an <answer> for the back' })
    }
  } else if (type === 'long') {
    q.rubric = answer ?? ''
  } else if (type === 'num') {
    const value = answer === null ? NaN : Number(stripQzTags(answer).trim())
    q.numAnswer = Number.isFinite(value) ? value : null
    q.numUnit = stripQzTags(unit).trim()
    const tol = tolerance === null ? 0 : Number(tolerance.trim())
    q.numTolerance = Number.isFinite(tol) && tol >= 0 ? tol : 0
    if (q.numAnswer === null) {
      errors.push({ line: openLine, message: 'a numeric question needs a numeric <answer>' })
    }
  } else if (type === 'match') {
    const pairs: QzPair[] = []
    const stem: string[] = []
    for (const line of bodyLines) {
      const pair = line.match(RE_MATCH_PAIR)
      if (pair) pairs.push({ left: pair[1].trim(), right: pair[2].trim() })
      else stem.push(line)
    }
    if (pairs.length < 2) {
      errors.push({ line: openLine, message: 'a matching question needs at least two "a :: b" pairs' })
    }
    q.pairs = pairs
    promptLines = stem
  } else if (type === 'order') {
    const items: string[] = []
    const stem: string[] = []
    for (const line of bodyLines) {
      const item = line.match(RE_ORDER_ITEM)
      if (item) items.push(item[1].trim())
      else stem.push(line)
    }
    if (items.length < 2) {
      errors.push({ line: openLine, message: 'an ordering question needs at least two numbered items' })
    }
    q.items = items
    promptLines = stem
  }

  q.prompt = stripQzTagsKeepMedia(promptLines.join('\n')).trim()
  q.grade = parseGrade(attrs.grade ?? '') ?? defaultGrade(type)

  // Per-question scoring override: correct=6 wrong=0 blank=1.5
  const score: QzScoreRule = {}
  for (const key of ['correct', 'wrong', 'blank'] as const) {
    const raw = attrs[key]
    if (raw === undefined) continue
    const value = Number(raw)
    if (Number.isFinite(value)) score[key] = value
    else errors.push({ line: openLine, message: `unreadable ${key} score "${raw}"` })
  }
  if (Object.keys(score).length > 0) q.scoring = score

  return q
}

export function parseQz(body: string): QzDoc {
  const lines = body.split('\n')
  const errors: QzParseError[] = []

  const doc: QzDoc = {
    paperType: 'quiz',
    pageMode: 'cont',
    timing: 'none',
    totalMs: null,
    usesPassages: false,
    intro: '',
    scoring: null,
    passages: [],
    questions: [],
    errors,
  }

  // --- descriptors and body blocks -----------------------------------------
  let i = 0
  let sawBlock = false

  // Descriptor tags are only read before the first body block, so a `<key = value>`
  // line inside a passage is content rather than configuration.
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!sawBlock) {
      if (trimmed === '') { i++; continue }
      const desc = trimmed.match(RE_DESCRIPTOR)
      if (desc) {
        applyDescriptor(doc, desc[1].toLowerCase(), desc[2].trim(), errors, i + 1)
        i++
        continue
      }
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) { i++; continue }
      sawBlock = true
      continue
    }
    break
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed === '') { i++; continue }

    if (RE_OPEN_TEXT.test(trimmed)) {
      const start = i
      const collected: string[] = []
      i++
      let closed = false
      while (i < lines.length) {
        if (RE_CLOSE_TEXT.test(lines[i].trim())) { closed = true; i++; break }
        collected.push(lines[i])
        i++
      }
      if (!closed) errors.push({ line: start + 1, message: 'unclosed <text> block' })
      doc.intro = stripQzTagsKeepMedia(collected.join('\n')).trim()
      continue
    }

    if (RE_OPEN_SCORING.test(trimmed)) {
      const start = i
      const collected: string[] = []
      i++
      let closed = false
      while (i < lines.length) {
        if (RE_CLOSE_SCORING.test(lines[i].trim())) {
          closed = true
          i++
          break
        }
        collected.push(lines[i])
        i++
      }
      if (!closed) errors.push({ line: start + 1, message: 'unclosed <scoring> block' })
      doc.scoring = parseScoreRule(collected, start + 1, errors)
      continue
    }

    const passageOpen = trimmed.match(RE_OPEN_PASSAGE)
    if (passageOpen) {
      const start = i
      const id = passageOpen[1]
      const collected: string[] = []
      i++
      let closed = false
      while (i < lines.length) {
        if (RE_CLOSE_PASSAGE.test(lines[i].trim())) { closed = true; i++; break }
        collected.push(lines[i])
        i++
      }
      if (!closed) errors.push({ line: start + 1, message: `unclosed <passage:${id}> block` })
      if (doc.passages.some((p) => p.id === id)) {
        errors.push({ line: start + 1, message: `passage "${id}" declared twice — keeping the first` })
      } else {
        doc.passages.push({ id, body: stripQzTagsKeepMedia(collected.join('\n')).trim() })
      }
      continue
    }

    const qOpen = trimmed.match(RE_OPEN_Q)
    if (qOpen) {
      const start = i
      const rawType = qOpen[1]
      const attrStr = qOpen[2]
      const collected: string[] = []
      i++
      let closed = false
      while (i < lines.length) {
        if (RE_CLOSE_Q.test(lines[i].trim())) { closed = true; i++; break }
        collected.push(lines[i])
        i++
      }
      if (!closed) {
        errors.push({ line: start + 1, message: `unclosed <q:${rawType}> block — read to end of file` })
      }
      const q = parseQuestion(rawType, attrStr, collected.join('\n'), start + 1, errors)
      q.id = `q${doc.questions.length + 1}`
      doc.questions.push(q)
      continue
    }

    // Stray content outside any block. Keep it as intro text rather than
    // discarding it, but say so once.
    const stray: string[] = []
    const strayStart = i
    while (i < lines.length) {
      const t = lines[i].trim()
      if (t === '') {
        if (stray.length > 0 && i + 1 < lines.length && isBlockStart(lines[i + 1].trim())) break
        stray.push(lines[i])
        i++
        continue
      }
      if (isBlockStart(t)) break
      stray.push(lines[i])
      i++
    }
    const text = stripQzTagsKeepMedia(stray.join('\n')).trim()
    if (text) {
      errors.push({ line: strayStart + 1, message: 'text outside any block — shown as intro' })
      doc.intro = doc.intro ? `${doc.intro}\n\n${text}` : text
    }
  }

  // --- cross-checks ---------------------------------------------------------
  for (const q of doc.questions) {
    if (q.passageId && !doc.passages.some((p) => p.id === q.passageId)) {
      errors.push({
        line: 1,
        message: `question ${q.id} refers to passage "${q.passageId}", which is not declared`,
      })
      q.passageId = null
    }
  }
  if (doc.passages.length > 0) doc.usesPassages = true

  return doc
}

function isBlockStart(trimmed: string): boolean {
  return (
    RE_OPEN_TEXT.test(trimmed) ||
    RE_CLOSE_TEXT.test(trimmed) ||
    RE_OPEN_SCORING.test(trimmed) ||
    RE_CLOSE_SCORING.test(trimmed) ||
    RE_OPEN_PASSAGE.test(trimmed) ||
    RE_OPEN_Q.test(trimmed)
  )
}

function applyDescriptor(
  doc: QzDoc,
  key: string,
  value: string,
  errors: QzParseError[],
  line: number,
): void {
  const v = value.trim().toLowerCase()

  if (key === 'type') {
    if (v === 'exam' || v === 'quiz' || v === 'flashcard') doc.paperType = v
    else errors.push({ line, message: `unknown type "${value}" — treating this as a quiz` })
    return
  }

  if (key === 'page') {
    if (v === 'cont' || v === 'sep') doc.pageMode = v
    else errors.push({ line, message: `unknown page mode "${value}" — using cont` })
    return
  }

  if (key === 'timing') {
    if (v === 'individual') { doc.timing = 'individual'; return }
    const raw = value.trim()
    const afterColon = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
    const ms = parseDuration(afterColon)
    if (ms === null || ms <= 0) {
      errors.push({ line, message: `unreadable timing "${value}" — this paper is untimed` })
      doc.timing = 'none'
      doc.totalMs = null
      return
    }
    doc.timing = 'total'
    doc.totalMs = ms
    return
  }

  if (key === 'passage') {
    const flag = parseBool(value)
    if (flag === null) {
      errors.push({ line, message: `passage must be true or false, got "${value}"` })
      return
    }
    doc.usesPassages = flag
    return
  }

  // Unknown keys are ignored rather than fatal: a forward-compatible file should
  // still open.
}

// ---------------------------------------------------------------------------
// Authored paper → markdown, for PDF export
// ---------------------------------------------------------------------------

function rule(marks: number): string {
  return `*(${marks} mark${marks === 1 ? '' : 's'})*`
}

/** Questions only — what a candidate sees. */
export function qzToPaperMarkdown(doc: QzDoc): string {
  const out: string[] = []
  if (doc.intro) out.push(doc.intro, '')
  for (const p of doc.passages) out.push(`> **Passage ${p.id}**`, '>', indentQuote(p.body), '')

  doc.questions.forEach((q, index) => {
    if (q.passageId) {
      const passage = doc.passages.find((p) => p.id === q.passageId)
      if (passage) out.push(`*See passage ${passage.id}.*`, '')
    }
    out.push(`**${index + 1}.** ${q.prompt} ${rule(q.marks)}`, '')

    if (q.type === 'mcq' && q.options) {
      q.options.forEach((o, oi) => out.push(`- ${String.fromCharCode(97 + oi)}) ${o.text}`))
      out.push('')
    } else if (q.type === 'match' && q.pairs) {
      q.pairs.forEach((p) => out.push(`- ${p.left} — ____`))
      out.push('')
    } else if (q.type === 'order' && q.items) {
      q.items.forEach(() => out.push('- ____'))
      out.push('')
    } else if (q.type === 'blank') {
      out.push('')
    } else if (q.type === 'tf') {
      out.push('*True / False*', '')
    } else {
      out.push('', '&nbsp;', '')
    }
  })
  return out.join('\n').trim()
}

/** What a marker sees: every model answer and rubric. */
export function qzToAnswerKeyMarkdown(doc: QzDoc): string {
  const out: string[] = []
  doc.questions.forEach((q, index) => {
    out.push(`**${index + 1}.** ${q.prompt}`, '')
    if (q.type === 'mcq' && q.options) {
      const correct = q.options.filter((o) => o.correct).map((o) => o.text)
      out.push(`Answer: ${correct.join('; ') || '—'}`, '')
    } else if (q.type === 'tf') {
      out.push(`Answer: ${q.tfAnswer === null ? '—' : q.tfAnswer ? 'True' : 'False'}`, '')
    } else if (q.type === 'blank' && q.blanks) {
      out.push(`Answer: ${q.blanks.map((alts) => alts.join(' / ')).join('; ')}`, '')
    } else if (q.type === 'num') {
      out.push(
        `Answer: ${q.numAnswer ?? '—'}${q.numUnit ? ' ' + q.numUnit : ''}${q.numTolerance ? ` (±${q.numTolerance})` : ''}`,
        '',
      )
    } else if (q.type === 'match' && q.pairs) {
      q.pairs.forEach((p) => out.push(`- ${p.left} → ${p.right}`))
      out.push('')
    } else if (q.type === 'order' && q.items) {
      q.items.forEach((item, i) => out.push(`${i + 1}. ${item}`))
      out.push('')
    } else if (q.rubric || q.answer) {
      out.push(q.rubric || q.answer || '', '')
    } else {
      out.push('*No model answer — judged by the marker.*', '')
    }
  })
  return out.join('\n').trim()
}

function indentQuote(body: string): string {
  return body
    .split('\n')
    .map((l) => (l.trim() ? `> ${l}` : '>'))
    .join('\n')
}
