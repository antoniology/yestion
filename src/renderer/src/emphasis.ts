/**
 * CJK emphasis repair.
 *
 * CommonMark decides whether `*` / `**` may close by looking at the character
 * before it: a punctuation mark makes the run left-flanking only, so it cannot
 * close. That is right for English — `word**` is not emphasis — but Chinese
 * writers put a full-width colon straight before a closing run all the time:
 *
 *     ***主题：**精神苦难*
 *
 * CommonMark reads the `**` on the wrong side of `：` and renders a literal
 * `***主题：*`, which is not what anyone wrote. The fix is to slip a zero-width
 * space (U+200B) between the punctuation and the run: the preceding character is
 * then neither whitespace nor punctuation, the delimiter can close, and nothing
 * is visible. The marker is stripped again by `stripCjkMarkers` before the
 * document is written to disk, so the file keeps exactly the text the user
 * typed.
 *
 * Code is left alone. Inserting an invisible character into a fenced block or
 * an inline code span would change program text — invisible here, but real when
 * copied out.
 */

/** Punctuation that ends a clause in Chinese/Japanese prose. */
const CJK_PUNCT = '：，。；！？、）》」』】〕〉'

/** A delimiter run that a CJK punctuation mark sits directly in front of. */
const RUN_AFTER_PUNCT = new RegExp(`([${CJK_PUNCT}])([*_]{1,3})`, 'g')

const HAS_CJK_PUNCT = new RegExp(`[${CJK_PUNCT}]`)
const ZWSP = '\u200B'
/** Only the marker this module inserts \u2014 not a zero-width space the user typed. */
const ZWSP_AFTER_PUNCT = new RegExp(`([${CJK_PUNCT}])\\u200B`, 'g')
const FENCE = /^\s*(`{3,}|~{3,})/

export function relaxCjkEmphasis(source: string): string {
  if (!source || !HAS_CJK_PUNCT.test(source)) return source

  let inFence = false
  let fenceChar = ''
  return source
    .split('\n')
    .map((line) => {
      const m = FENCE.exec(line)
      if (m) {
        const ch = m[1][0]
        if (!inFence) {
          inFence = true
          fenceChar = ch
        } else if (ch === fenceChar) {
          inFence = false
        }
        return line
      }
      if (inFence) return line
      // Split inline code spans out; only the even (prose) pieces are repaired.
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : part.replace(RUN_AFTER_PUNCT, `$1${ZWSP}$2`)))
        .join('')
    })
    .join('\n')
}

/** Remove the repair markers before the document is serialized. */
export function stripCjkMarkers(source: string): string {
  return source.includes(ZWSP) ? source.replace(ZWSP_AFTER_PUNCT, '$1') : source
}
