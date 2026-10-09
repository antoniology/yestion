export interface ThemeDef {
  id: string
  label: string
  kind: 'light' | 'dark'
  vars: Record<string, string>
}

export const THEMES: ThemeDef[] = [
  {
    id: 'light',
    label: 'Light (GitHub)',
    kind: 'light',
    vars: {
      '--bg': '#f6f8fa',
      '--panel-bg': '#ffffff',
      '--text': '#1f2328',
      '--muted': '#59636e',
      '--accent': '#0969da',
      '--border': '#d1d9e0',
      '--code-bg': '#f6f8fa',
      '--code-text': '#1f2328',
      '--quote-bg': '#f6f8fa',
      '--quote-border': '#d1d9e0',
      '--selection': 'rgba(9, 105, 218, 0.2)',
      '--cursor': '#0969da',
      '--active-line': 'rgba(9, 105, 218, 0.05)',
      '--md-heading': '#1f2328',
      '--md-strong': '#1f2328',
      '--md-em': '#1f2328',
      '--md-link': '#0969da',
      '--md-url': '#8250df',
      '--md-quote': '#59636e',
      '--md-list': '#1f2328',
      '--md-meta': '#59636e',
      '--md-keyword': '#0969da',
      '--md-code': '#cf222e',
      '--divider-bg': '#e6e8eb'
    }
  },
  {
    id: 'dark',
    label: 'Dark (Terminal)',
    kind: 'dark',
    vars: {
      '--bg': '#1e1e1e',
      '--panel-bg': '#1e1e1e',
      '--text': '#d4d4d4',
      '--muted': '#9d9d9d',
      '--accent': '#4ec9b0',
      '--border': '#3c3c3c',
      '--code-bg': '#252526',
      '--code-text': '#d4d4d4',
      '--quote-bg': '#252526',
      '--quote-border': '#4e4e4e',
      '--selection': 'rgba(212, 212, 212, 0.25)',
      '--cursor': '#d4d4d4',
      '--active-line': 'rgba(255, 255, 255, 0.06)',
      '--md-heading': '#e6e6e6',
      '--md-strong': '#e6e6e6',
      '--md-em': '#d4d4d4',
      '--md-link': '#4ec9b0',
      '--md-url': '#4ec9b0',
      '--md-quote': '#9d9d9d',
      '--md-list': '#e6e6e6',
      '--md-meta': '#8c8c8c',
      '--md-keyword': '#4ec9b0',
      '--md-code': '#ce9178',
      '--divider-bg': '#3c3c3c'
    }
  },
  {
    id: 'githubDark',
    label: 'Dark (GitHub)',
    kind: 'dark',
    vars: {
      '--bg': '#1f2328',
      '--panel-bg': '#0d1117',
      '--text': '#e6edf3',
      '--muted': '#9198a1',
      '--accent': '#4493f8',
      '--border': '#30363d',
      '--code-bg': '#161b22',
      '--code-text': '#e6edf3',
      '--quote-bg': '#161b22',
      '--quote-border': '#30363d',
      '--selection': 'rgba(68, 147, 248, 0.3)',
      '--cursor': '#58a6ff',
      '--active-line': 'rgba(68, 147, 248, 0.1)',
      '--md-heading': '#f2f5f8',
      '--md-strong': '#f2f5f8',
      '--md-em': '#e6edf3',
      '--md-link': '#4493f8',
      '--md-url': '#a371f7',
      '--md-quote': '#9198a1',
      '--md-list': '#f2f5f8',
      '--md-meta': '#9198a1',
      '--md-keyword': '#4493f8',
      '--md-code': '#ff7b72',
      '--divider-bg': '#21262d'
    }
  },
  {
    id: 'plainWhite',
    label: 'Plain White',
    kind: 'light',
    vars: {
      '--bg': '#ffffff',
      '--panel-bg': '#ffffff',
      '--text': '#000000',
      '--muted': '#666666',
      '--accent': '#000000',
      '--border': '#000000',
      '--code-bg': '#ffffff',
      '--code-text': '#000000',
      '--quote-bg': '#ffffff',
      '--quote-border': '#000000',
      '--selection': 'rgba(0, 0, 0, 0.15)',
      '--cursor': '#000000',
      '--active-line': 'rgba(0, 0, 0, 0.05)',
      '--md-heading': '#000000',
      '--md-strong': '#000000',
      '--md-em': '#000000',
      '--md-link': '#000000',
      '--md-url': '#000000',
      '--md-quote': '#000000',
      '--md-list': '#000000',
      '--md-meta': '#000000',
      '--md-keyword': '#000000',
      '--md-code': '#000000',
      '--divider-bg': '#000000'
    }
  },
  {
    id: 'plainBlack',
    label: 'Plain Black',
    kind: 'dark',
    vars: {
      '--bg': '#000000',
      '--panel-bg': '#000000',
      '--text': '#ffffff',
      '--muted': '#999999',
      '--accent': '#ffffff',
      '--border': '#ffffff',
      '--code-bg': '#000000',
      '--code-text': '#ffffff',
      '--quote-bg': '#000000',
      '--quote-border': '#ffffff',
      '--selection': 'rgba(255, 255, 255, 0.2)',
      '--cursor': '#ffffff',
      '--active-line': 'rgba(255, 255, 255, 0.08)',
      '--md-heading': '#ffffff',
      '--md-strong': '#ffffff',
      '--md-em': '#ffffff',
      '--md-link': '#ffffff',
      '--md-url': '#ffffff',
      '--md-quote': '#ffffff',
      '--md-list': '#ffffff',
      '--md-meta': '#ffffff',
      '--md-keyword': '#ffffff',
      '--md-code': '#ffffff',
      '--divider-bg': '#ffffff'
    }
  },
  {
    id: 'sepia',
    label: 'Sepia',
    kind: 'light',
    vars: {
      '--bg': '#f4ecd8',
      '--panel-bg': '#faf3e3',
      '--text': '#5b4636',
      '--muted': '#8a7a68',
      '--accent': '#a0522d',
      '--border': '#e0d3b5',
      '--code-bg': '#efe6cd',
      '--code-text': '#5b4636',
      '--quote-bg': '#efe6cd',
      '--quote-border': '#d4b98c',
      '--selection': 'rgba(160, 82, 45, 0.2)',
      '--cursor': '#a0522d',
      '--active-line': 'rgba(160, 82, 45, 0.07)',
      '--md-heading': '#4a3728',
      '--md-strong': '#4a3728',
      '--md-em': '#5b4636',
      '--md-link': '#a0522d',
      '--md-url': '#8b4513',
      '--md-quote': '#8a7a68',
      '--md-list': '#4a3728',
      '--md-meta': '#8a7a68',
      '--md-keyword': '#a0522d',
      '--md-code': '#8b4513',
      '--divider-bg': '#e8dcc0'
    }
  },
  {
    id: 'ocean',
    label: 'Ocean',
    kind: 'dark',
    vars: {
      '--bg': '#0b1e2d',
      '--panel-bg': '#0f2637',
      '--text': '#d8e6ee',
      '--muted': '#6d93a8',
      '--accent': '#4fc3f7',
      '--border': '#1f3a4d',
      '--code-bg': '#0a1b28',
      '--code-text': '#d8e6ee',
      '--quote-bg': '#0a1b28',
      '--quote-border': '#1f3a4d',
      '--selection': 'rgba(79, 195, 247, 0.3)',
      '--cursor': '#4fc3f7',
      '--active-line': 'rgba(79, 195, 247, 0.08)',
      '--md-heading': '#eaf6ff',
      '--md-strong': '#eaf6ff',
      '--md-em': '#d8e6ee',
      '--md-link': '#4fc3f7',
      '--md-url': '#81d4fa',
      '--md-quote': '#6d93a8',
      '--md-list': '#eaf6ff',
      '--md-meta': '#6d93a8',
      '--md-keyword': '#4fc3f7',
      '--md-code': '#80d8ff',
      '--divider-bg': '#153046'
    }
  },
  {
    id: 'forest',
    label: 'Forest',
    kind: 'light',
    vars: {
      '--bg': '#f2f5ee',
      '--panel-bg': '#fbfcf8',
      '--text': '#2d3a2c',
      '--muted': '#7a8a76',
      '--accent': '#3f7d3e',
      '--border': '#d7e0d2',
      '--code-bg': '#eef3e9',
      '--code-text': '#2d3a2c',
      '--quote-bg': '#eef3e9',
      '--quote-border': '#a9c49c',
      '--selection': 'rgba(63, 125, 62, 0.2)',
      '--cursor': '#3f7d3e',
      '--active-line': 'rgba(63, 125, 62, 0.07)',
      '--md-heading': '#243020',
      '--md-strong': '#243020',
      '--md-em': '#2d3a2c',
      '--md-link': '#3f7d3e',
      '--md-url': '#2f6d2e',
      '--md-quote': '#7a8a76',
      '--md-list': '#243020',
      '--md-meta': '#7a8a76',
      '--md-keyword': '#3f7d3e',
      '--md-code': '#2f6d2e',
      '--divider-bg': '#e0e7da'
    }
  }
]

export const DEFAULT_THEME = 'light'

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!
}

export function nextTheme(currentId: string): ThemeDef {
  const idx = THEMES.findIndex((t) => t.id === currentId)
  return THEMES[(idx + 1) % THEMES.length]
}

// ---- derived tokens -------------------------------------------------------
// Themes only define the base palette; the richer design-system tokens
// (hover fills, accent tints, agent surfaces…) are derived so every theme
// works everywhere in the app.
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const mix = (x: number, y: number): number => Math.round(x + (y - x) * t)
  const to2 = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${to2(mix(r1, r2))}${to2(mix(g1, g2))}${to2(mix(b1, b2))}`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function deriveTokens(v: Record<string, string>): Record<string, string> {
  const bg = v['--bg'] ?? '#ffffff'
  const panel = v['--panel-bg'] ?? '#ffffff'
  const text = v['--text'] ?? '#000000'
  const muted = v['--muted'] ?? '#888888'
  const accent = v['--accent'] ?? '#0969da'
  const border = v['--border'] ?? '#e0e0e0'
  const codeBg = v['--code-bg'] ?? bg
  const isDark = luminance(bg) < 0.5
  return {
    '--text-2': text,
    '--muted-2': muted,
    '--muted-3': mixHex(muted, panel, 0.45),
    '--sidebar-bg': bg,
    '--agent-bg': luminance(bg) > 0.5 ? mixHex(bg, panel, 0.5) : bg,
    '--surface-elevated': panel,
    '--hover-bg': rgba(text, 0.045),
    '--active-bg': rgba(text, 0.075),
    '--accent-soft': rgba(accent, 0.1),
    '--accent-soft-2': rgba(accent, 0.18),
    // In dark themes a bubble filled with the (light) text colour glares; use a
    // lifted surface instead so sent messages stay readable but calm.
    '--accent-ink': isDark
      ? text
      : luminance(accent) > 0.6
        ? '#000000'
        : '#ffffff',
    '--user-bubble': isDark ? mixHex(panel, text, 0.16) : text,
    '--selected-bg': v['--selection'] ?? rgba(accent, 0.15),
    '--border-strong': mixHex(border, text, 0.25),
    '--code-bg-elevated': codeBg,
    // Card-on-backdrop shell (the PPT redesign): panels float on a slightly
    // darker backdrop; controls sit on a soft fill inside the cards.
    '--app-bg': isDark ? mixHex(bg, '#000000', 0.4) : mixHex(bg, '#000000', 0.055),
    '--card-bg': panel,
    '--control-bg': isDark ? mixHex(bg, panel, 0.45) : mixHex(bg, panel, 0.62),
    '--control-hover': isDark ? mixHex(bg, panel, 0.7) : mixHex(bg, panel, 0.82),
    '--control-text': isDark ? text : mixHex(text, panel, 0.12)
  }
}

export function applyTheme(id: string): ThemeDef {
  const theme = getTheme(id)
  const root = document.documentElement
  root.style.colorScheme = theme.kind === 'dark' ? 'dark' : 'light'
  const all = { ...theme.vars, ...deriveTokens(theme.vars) }
  for (const [key, value] of Object.entries(all)) {
    root.style.setProperty(key, value)
  }
  root.dataset.theme = theme.id
  root.dataset.themeKind = theme.kind
  return theme
}
