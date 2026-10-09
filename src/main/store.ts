import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

// Dev/test isolation: a second copy of the app can run against throwaway state
// (its own settings + workspace) without disturbing the real installation.
// Must happen before any electron-store instance is created.
if (process.env.YESTION_USER_DATA) {
  app.setPath('userData', process.env.YESTION_USER_DATA)
}

/** A workspace the user has added to the switcher. */
export interface WorkspaceEntry {
  path: string
  name: string
  kind: 'plain' | 'private'
}

export interface Settings {
  workspace: string | null
  workspaces: WorkspaceEntry[]
  theme: string
  previewFont: string
  agentProvider: string
  agentModel: string
  agentApiKey: string
  agentThinking: string
  sidebarOpen: boolean
  agentOpen: boolean
  sidebarWidth: number
  agentWidth: number
  /** Sidebar model: 'links' (children = link targets) or 'folders'. */
  treeMode: 'links' | 'folders'
  pageMode: 'continuous' | 'paged'
  showPageTitle: boolean
  showPageIcon: boolean
  renderFontSize: string
  splitRatio: number
  exportMargin: 'thin' | 'medium' | 'wide'
  exportTitle: boolean
  exportIcon: boolean
}

const DEFAULTS: Settings = {
  workspace: null,
  workspaces: [],
  theme: 'light',
  previewFont: 'default',
  agentProvider: 'anthropic',
  agentModel: '',
  agentApiKey: '',
  agentThinking: 'max',
  sidebarOpen: true,
  agentOpen: false,
  sidebarWidth: 248,
  agentWidth: 380,
  treeMode: 'links',
  pageMode: 'continuous',
  showPageTitle: true,
  showPageIcon: true,
  renderFontSize: 'm',
  splitRatio: 0.5,
  exportMargin: 'medium',
  exportTitle: true,
  exportIcon: true
}

const SETTINGS_FILE = 'settings.json'

class SettingsStore {
  private cache: Settings = { ...DEFAULTS }
  private file: string
  private loaded: Promise<void>

  constructor() {
    this.file = join(app.getPath('userData'), SETTINGS_FILE)
    this.loaded = this.load()
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw)
      this.cache = { ...DEFAULTS, ...parsed }
    } catch {
      this.cache = { ...DEFAULTS }
    }
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.cache[key]
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.cache[key] = value
    void this.persist()
  }

  private async persist(): Promise<void> {
    await this.loaded
    try {
      await fs.mkdir(app.getPath('userData'), { recursive: true })
      await fs.writeFile(this.file, JSON.stringify(this.cache, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to persist settings', err)
    }
  }
}

export const settingsStore = new SettingsStore()
