// ---------------------------------------------------------------------------
// Reading fonts, by their real names.
//
// Shared by the toolbar picker and the settings modal so the two can never
// drift apart again. Each entry is a plain font stack: the first family that is
// actually installed wins, and the generic at the end keeps things sane if none
// of them are (Aptos, for instance, only exists with Microsoft Office).
// ---------------------------------------------------------------------------

export interface RenderFont {
  id: string
  /** Shown in the pickers — the font's real name. */
  label: string
  family: string
  group: 'Sans' | 'Serif' | 'Mono' | 'Asian'
}

export const RENDER_FONTS: RenderFont[] = [
  // ---- sans ----
  {
    id: 'default',
    label: 'System (San Francisco)',
    group: 'Sans',
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  {
    id: 'aptos',
    label: 'Aptos',
    group: 'Sans',
    // Ships with Microsoft 365; falls back to Calibri/Helvetica if absent.
    family: "Aptos, 'Aptos Display', Calibri, 'Helvetica Neue', Helvetica, sans-serif"
  },
  { id: 'helvetica', label: 'Helvetica', group: 'Sans', family: "Helvetica, 'Helvetica Neue', Arial, sans-serif" },
  { id: 'arial', label: 'Arial', group: 'Sans', family: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  {
    id: 'sfpro',
    label: 'SF Pro Text',
    group: 'Sans',
    family: "'SF Pro Text', 'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif"
  },

  // ---- serif ----
  { id: 'times', label: 'Times New Roman', group: 'Serif', family: "'Times New Roman', Times, serif" },
  // The app's long-standing default serif.
  { id: 'georgia', label: 'Georgia', group: 'Serif', family: "Georgia, 'Times New Roman', Times, serif" },
  {
    id: 'iowan',
    label: 'Iowan Old Style',
    group: 'Serif',
    family: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
  },
  {
    id: 'palatino',
    label: 'Palatino',
    group: 'Serif',
    family: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif"
  },
  { id: 'newyork', label: 'New York', group: 'Serif', family: "'New York', 'New York Medium', Georgia, serif" },
  { id: 'charter', label: 'Charter', group: 'Serif', family: "Charter, 'Bitstream Charter', Georgia, serif" },
  {
    id: 'baskerville',
    label: 'Baskerville',
    group: 'Serif',
    family: "Baskerville, 'Libre Baskerville', Georgia, serif"
  },
  { id: 'athelas', label: 'Athelas', group: 'Serif', family: 'Athelas, Georgia, serif' },
  { id: 'hoefler', label: 'Hoefler Text', group: 'Serif', family: "'Hoefler Text', Garamond, Georgia, serif" },
  { id: 'didot', label: 'Didot', group: 'Serif', family: "Didot, 'Playfair Display', Georgia, serif" },

  // ---- mono ----
  {
    id: 'menlo',
    label: 'Menlo (Terminal)',
    group: 'Mono',
    family: "Menlo, Monaco, 'SF Mono', 'Courier New', monospace"
  },
  {
    id: 'sfmono',
    label: 'SF Mono',
    group: 'Mono',
    family: "'SF Mono', SFMono-Regular, Menlo, Monaco, monospace"
  },
  { id: 'courier', label: 'Courier New', group: 'Mono', family: "'Courier New', Courier, monospace" },
  {
    id: 'andale',
    label: 'Andale Mono',
    group: 'Mono',
    family: "'Andale Mono', 'PT Mono', Menlo, monospace"
  },
  {
    id: 'systemMono',
    label: 'System Mono',
    group: 'Mono',
    family: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
  },

  // ---- asian ----
  // Windows/Office names come first (DengXian, YaHei, SimSun, KaiTi …) so the
  // intent survives on a machine that has them; each stack then falls back to
  // the macOS equivalents (PingFang, Songti, Heiti, Hiragino) and finally a
  // generic, so a missing family degrades gracefully instead of breaking.
  {
    id: 'dengxian',
    label: 'DengXian 等线',
    group: 'Asian',
    family: "DengXian, 'DengXian Light', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
  },
  {
    id: 'yahei',
    label: 'Microsoft YaHei 微软雅黑',
    group: 'Asian',
    family: "'Microsoft YaHei', 'Microsoft YaHei UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
  },
  {
    id: 'pingfang',
    label: 'PingFang SC 苹方',
    group: 'Asian',
    family: "'PingFang SC', 'PingFang HK', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
  },
  {
    id: 'simsun',
    label: 'SimSun 宋体',
    group: 'Asian',
    family: "SimSun, 'Songti SC', STSong, 'Noto Serif CJK SC', serif"
  },
  {
    id: 'songti',
    label: 'Songti SC 宋体-简',
    group: 'Asian',
    family: "'Songti SC', STSong, SimSun, 'Noto Serif CJK SC', serif"
  },
  {
    id: 'kaiti',
    label: 'KaiTi 楷体',
    group: 'Asian',
    family: "KaiTi, 'Kaiti SC', STKaiti, KaiTi_GB2312, 'Songti SC', STSong, serif"
  },
  {
    id: 'fangsong',
    label: 'FangSong 仿宋',
    group: 'Asian',
    family: "FangSong, STFangsong, 'Songti SC', SimSun, serif"
  },
  {
    id: 'simhei',
    label: 'SimHei 黑体',
    group: 'Asian',
    family: "SimHei, 'Heiti SC', STHeiti, 'PingFang SC', sans-serif"
  },
  {
    id: 'heiti',
    label: 'Heiti SC 黑体-简',
    group: 'Asian',
    family: "'Heiti SC', STHeiti, SimHei, 'PingFang SC', sans-serif"
  },
  {
    id: 'hiraginoGB',
    label: 'Hiragino Sans GB 冬青黑体',
    group: 'Asian',
    family: "'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  },
  {
    id: 'hiraginoJP',
    label: 'Hiragino Sans ヒラギノ角ゴ',
    group: 'Asian',
    family: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, 'Noto Sans JP', sans-serif"
  },
  {
    id: 'minchoJP',
    label: 'Hiragino Mincho 明朝体',
    group: 'Asian',
    family: "'Hiragino Mincho ProN', 'Yu Mincho', 'MS Mincho', 'Noto Serif JP', serif"
  },
  {
    id: 'gothicKR',
    label: 'Apple SD Gothic Neo 한국어',
    group: 'Asian',
    family: "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
  },
  {
    id: 'notocjk',
    label: 'Noto Sans CJK 思源黑体',
    group: 'Asian',
    family: "'Noto Sans CJK SC', 'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', sans-serif"
  }
]

/**
 * Families a PDF cannot carry.
 *
 * Chromium refuses to embed Apple's system faces (their licence forbids it), so
 * a stack that *leads* with one prints its text with no embedded font at all —
 * the file just names a font it never ships. Every reader then substitutes its
 * own, which is why the default reading font came out as Helvetica: the PDF was
 * the only place the name "San Francisco" had no meaning, and Preview fell
 * through to whatever it had.
 *
 * Naming an embeddable family in their place gives the export a real font.
 */
const UNPRINTABLE_FAMILY =
  /^(-apple-system|blinkmacsystemfont|system-ui|ui-[a-z]+|sf ?pro( ?text| ?display)?|sf ?mono|sfmono-regular|pingfang( ?(sc|hk|tc))?|-webkit-[a-z-]+)$/i

/**
 * The families in a reading-font stack that a print job can actually use,
 * generic last. A stack made only of system faces has nothing left, so it
 * falls back to the closest face macOS will let Chromium embed.
 */
export function printableStack(family: string, fallback = "'Helvetica Neue', Helvetica, Arial"): string {
  const generic = (family.match(/,\s*(sans-serif|serif|monospace)\s*$/i)?.[1] ?? '').toLowerCase()
  const families = family
    .replace(/,\s*(sans-serif|serif|monospace)\s*$/i, '')
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f && !UNPRINTABLE_FAMILY.test(f.replace(/^['"]|['"]$/g, '')))
  return `${families.length ? families.join(', ') : fallback}${generic ? `, ${generic}` : ''}`
}

/** Older ids kept working: the value sitting in settings.json resolves here. */
const FONT_ALIASES: Record<string, string> = {
  serif: 'georgia', // "Font: Serif" was Georgia
  sans: 'helvetica',
  uiSerif: 'iowan',
  mono: 'systemMono'
}

export function resolveFontId(id: string | undefined | null): string {
  if (!id) return 'default'
  const mapped = FONT_ALIASES[id] ?? id
  return RENDER_FONTS.some((f) => f.id === mapped) ? mapped : 'default'
}

export function fontById(id: string | undefined | null): RenderFont {
  const resolved = resolveFontId(id)
  return RENDER_FONTS.find((f) => f.id === resolved) ?? RENDER_FONTS[0]
}

/** Fill a <select> with every font, grouped, and mark the active one. */
export function fillFontSelect(select: HTMLSelectElement, activeId: string | undefined | null): void {
  select.innerHTML = ''
  for (const group of ['Sans', 'Serif', 'Mono', 'Asian'] as const) {
    const og = document.createElement('optgroup')
    og.label = group
    for (const font of RENDER_FONTS.filter((f) => f.group === group)) {
      const opt = document.createElement('option')
      opt.value = font.id
      opt.textContent = font.label
      og.appendChild(opt)
    }
    select.appendChild(og)
  }
  select.value = resolveFontId(activeId)
}
