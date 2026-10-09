// The 8 themes in src/renderer/src/themes.ts, reduced to the two facts the main
// process needs before the renderer exists: the window background (so a cold
// launch doesn't flash white for dark-theme users) and the light/dark kind for
// nativeTheme. Keep in sync with themes.ts when adding a theme.
const THEME_BG: Record<string, string> = {
  light: '#f6f8fa',
  dark: '#1e1e1e',
  githubDark: '#1f2328',
  plainWhite: '#ffffff',
  plainBlack: '#000000',
  sepia: '#f4ecd8',
  ocean: '#0b1e2d',
  forest: '#f2f5ee'
}

const THEME_KIND: Record<string, 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  githubDark: 'dark',
  plainWhite: 'light',
  plainBlack: 'dark',
  sepia: 'light',
  ocean: 'dark',
  forest: 'light'
}

export function themeBackground(id: string | undefined): string {
  return THEME_BG[id ?? 'light'] ?? THEME_BG.light
}

export function themeKind(id: string | undefined): 'light' | 'dark' {
  return THEME_KIND[id ?? 'light'] ?? 'light'
}
