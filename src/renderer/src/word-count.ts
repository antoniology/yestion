/**
 * Word counting for the page footer.
 *
 * Two modes, because the same character means different things in different
 * scripts. In Latin text a word is delimited by spaces, so splitting on
 * whitespace is exactly right. Chinese and Japanese do not put spaces between
 * words, so a whitespace split returns one "word" for an entire essay — which is
 * why the counting mode exists rather than a cleverer single heuristic.
 *
 *   words   — space/punctuation delimited tokens. The normal count.
 *   asian   — each CJK character counts once and each run of Latin letters or
 *             digits counts once, matching how 字数 is counted by Chinese word
 *             processors: a Latin word counts as one, a Chinese character as one.
 *
 * Neither mode counts a bare punctuation mark, and both ignore whitespace.
 */

export type CountMode = 'words' | 'asian'

/**
 * Han, kana and hangul. Extension B and beyond live outside the BMP; they are
 * rare in student work and a surrogate-pair-safe class would make this regex
 * unreadable, so they are left to the Latin side, where they still count once.
 */
const CJK_CLASS = '[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]'
const CJK_RE = new RegExp(CJK_CLASS, 'gu')
const CJK_TEST = new RegExp(CJK_CLASS, 'u')

/** A run of letters or digits; an apostrophe or hyphen may join two of them. */
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

/** Space-delimited words. CJK runs collapse into one token, as they should. */
function wordCount(text: string): number {
  return (text.match(WORD_RE) ?? []).length
}

/** Characters in the Asian sense: each CJK glyph, plus each Latin word. */
function asianCount(text: string): number {
  let glyphs = 0
  // Replace as we count, so the Latin pass below cannot see the CJK run and
  // count it a second time as one word.
  const rest = text.replace(CJK_RE, () => {
    glyphs++
    return ' '
  })
  return glyphs + wordCount(rest)
}

/** Count one piece of text. */
export function countText(text: string, mode: CountMode): number {
  if (!text) return 0
  return mode === 'asian' ? asianCount(text) : wordCount(text)
}

/**
 * The footer string.
 *
 * `selected` is `null` when nothing is selected and the number of units inside
 * the selection otherwise — a selection of pure whitespace counts zero and still
 * reports "0 of N", because the user selected *something* and expects an answer
 * about it.
 */
export function formatCount(total: number, selected: number | null, mode: CountMode): string {
  const unit = mode === 'asian' ? 'character' : 'word'
  const label = (n: number): string => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`
  return selected === null ? label(total) : `${selected.toLocaleString('en-US')} of ${label(total)}`
}

/** Whether a string is mostly CJK — used only to explain the mode in Settings. */
export function looksAsian(text: string): boolean {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    if (CJK_TEST.test(ch)) cjk++
    else other++
  }
  return cjk > other
}
