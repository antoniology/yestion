import { app, shell, BrowserWindow, ipcMain, dialog, Menu, clipboard, nativeTheme } from 'electron'
import { basename, join, dirname } from 'node:path'
import { writeFile as fsp, readFile as fsReadFile, access as fsAccess, appendFile } from 'node:fs/promises'
import { watch as fsWatch, readFileSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { buildAppMenu } from './menu'
import { buildLinkTree, organizeAfterSave } from './linktree'
import {
  writePiConfig,
  importFromPi,
  listProviderStatus,
  listOllamaModels,
  probeDraft,
  saveProviders,
  setProviderKey,
  testProvider,
  type ProviderConfig
} from './providers'
import { settingsStore, type WorkspaceEntry } from './store'
import { themeBackground, themeKind } from './theme-meta'
import {
  closeVaultSession,
  createVault,
  currentVault,
  flushVault,
  isVault,
  openVaultSession,
  readVaultConfig,
  scheduleVaultFlush,
  VaultError
} from './vault'
import {
  listWorkspace,
  parsePageFile,
  readPage,
  searchWorkspace,
  savePage,
  createPage,
  deletePageOrFolder,
  resolvePageLink,
  readTextFile,
  writeTextFile,
  fileKind,
  listAllPages,
  createWorkspace,
  validateWorkspace,
  convertToWorkspace,
  convertLoosePage
} from './workspace'
import { logLine } from './log'
import {
  startAgentSession,
  getCurrentHandle,
  listAvailableModels,
  listAgentSessions,
  readAgentSessionMessages,
  type AgentHandle,
  type AgentSettings
} from './agent'

// Nothing pi does should reach the network for catalogs or packages.
process.env.PI_OFFLINE = '1'

let mainWindow: BrowserWindow | null = null
let agent: AgentHandle | null = null

function getWorkspace(): string | null {
  // YESTION_WORKSPACE pins a dev/test instance to a throwaway workspace.
  if (process.env.YESTION_WORKSPACE) return process.env.YESTION_WORKSPACE
  // An unlocked private workspace is read/written through its decrypted copy;
  // everything else (tree, editors, viewers, watcher) stays path-based.
  const vault = currentVault()
  if (vault) return vault.workDir
  const w = settingsStore.get('workspace') as string | undefined
  return w && w.length > 0 ? w : null
}

/** The workspace path as the user knows it (the hidden vault folder for private ones). */
function getWorkspaceDisplay(): string | null {
  const vault = currentVault()
  if (vault) return vault.root
  return getWorkspace()
}

async function workspaceEntries(): Promise<(WorkspaceEntry & { missing: boolean; unlocked: boolean })[]> {
  const vault = currentVault()
  const list = (settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []
  const out: (WorkspaceEntry & { missing: boolean; unlocked: boolean })[] = []
  for (const w of list) {
    let missing = false
    try {
      await fsAccess(w.path)
    } catch {
      missing = true
    }
    out.push({ ...w, missing, unlocked: !!vault && vault.root === w.path })
  }
  return out
}

/** One-time migration: an existing single-workspace setting becomes the list. */
async function migrateWorkspaceList(): Promise<void> {
  const list = (settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []
  if (list.length > 0) return
  const w = settingsStore.get('workspace') as string | null
  if (!w) return
  const isPrivate = await isVault(w)
  let name = w.split('/').pop() ?? 'Workspace'
  if (isPrivate) {
    const cfg = await readVaultConfig(w)
    name = cfg?.name ?? name.replace(/^\./, '').replace(/\.yestion$/, '')
  }
  settingsStore.set('workspaces', [{ path: w, name, kind: isPrivate ? 'private' : 'plain' }])
}

async function createWindow(): Promise<BrowserWindow> {
  // The theme below (and every setting the renderer reads at boot) must come
  // from the file, not the defaults.
  await settingsStore.ready()
  // Paint the window in the user's own theme background from the very first
  // frame — a dark-theme user used to get a white flash on every launch.
  const theme = settingsStore.get('theme') as string | undefined
  nativeTheme.themeSource = themeKind(theme)
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Yestion',
    backgroundColor: themeBackground(theme),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const isCmd = process.platform === 'darwin' ? input.meta : input.control
    if (!isCmd) return
    const key = input.key
    // macOS reports the zoom-in gesture as ⌘⇧= on most keyboard layouts, which
    // the '+' menu accelerator never matches — handle it here (as zoom-out
    // already was), plus ⌘0 to reset.
    const isPlus = key === '=' || key === '+' || key === 'numadd'
    const isMinus = key === '-' || key === '_' || key === '\u2212' || key === 'numsub'
    const isZero = key === '0' || key === 'num0'
    if (isPlus) {
      if (Date.now() - zoomMenuState.inAt < 300) return
      event.preventDefault()
      win.webContents.setZoomLevel(Math.min(5, win.webContents.getZoomLevel() + 0.5))
      return
    }
    if (isMinus) {
      if (Date.now() - zoomMenuState.outAt < 300) return
      event.preventDefault()
      win.webContents.setZoomLevel(Math.max(-3, win.webContents.getZoomLevel() - 0.5))
      return
    }
    if (isZero) {
      event.preventDefault()
      win.webContents.setZoomLevel(0)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// ---------------- IPC: workspace ----------------

// ---------------------------------------------------------------------------
// Workspace file watcher.
//
// Our own saves echo back through it, so they are tagged (selfWrites) and
// skipped; everything else — the built-in agent, an external pi/CLI agent, a
// Finder edit — refreshes the tree and reloads the open page.
// ---------------------------------------------------------------------------
const stopWatching = (): void => {
  watchedRoot = null
  try { wsWatcher?.close() } catch { /* ignore */ }
  wsWatcher = null
  if (wsWatcherTimer) { clearTimeout(wsWatcherTimer); wsWatcherTimer = null }
}
let wsWatcher: import('node:fs').FSWatcher | null = null
let wsWatcherTimer: ReturnType<typeof setTimeout> | null = null
// Files this app wrote itself (page saves). The watcher sees them moments
// later; treating them as "external" made the renderer reload the page and
// dump the caret at the end of the document. Anything NOT in here is an
// agent / external editor change and must refresh the UI.
const selfWrites = new Map<string, { body: string; at: number }>()

let watchedRoot: string | null = null

/** Start (or move) the watcher for `root` if it isn't already watching it. */
const ensureWatching = (root: string | null): void => {
  if (!root || root === watchedRoot) return
  watchWorkspace(root)
}

const watchWorkspace = (root: string): void => {
  watchedRoot = root
  try { wsWatcher?.close() } catch { /* ignore */ }
  wsWatcher = null
  try {
    wsWatcher = fsWatch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      if (wsWatcherTimer) clearTimeout(wsWatcherTimer)
      wsWatcherTimer = setTimeout(() => {
        wsWatcherTimer = null
        const rel = String(filename).replace(/\\/g, '/')
        if (rel.startsWith('.yestion') || rel.startsWith('.pi')) return
        // Private workspaces: mirror edits (including the agent's) back into
        // the encrypted container instead of telling the UI to re-read files.
        if (currentVault()) {
          scheduleVaultFlush()
          return
        }
        // Our own save echoing back? Then there is nothing to refresh.
        const mine = selfWrites.get(rel)
        if (mine) {
          if (Date.now() - mine.at > 8000) {
            selfWrites.delete(rel)
          } else {
            try {
              if (readFileSync(join(root, rel), 'utf-8') === mine.body) {
                selfWrites.delete(rel)
                return
              }
            } catch {
              /* unreadable → treat as external */
            }
          }
        }
        mainWindow?.webContents.send('ws:external-change', rel)
      }, 350)
    })
  } catch (err) {
    // Was a hardcoded /tmp file nothing ever read; the app log is where the
    // user (and support) actually look.
    void logLine(`workspace watcher failed to start: ${String(err)}`, 'warn')
  }
}

function registerWorkspaceHandlers(): void {
  ipcMain.handle('ws:get', async () => {
    const vault = currentVault()
    return {
      workspace: getWorkspace() ?? null,
      displayPath: getWorkspaceDisplay() ?? null,
      name: vault ? vault.name : null,
      private: !!vault,
      locked: !vault && (await isVault(settingsStore.get('workspace') as string ?? '')),
      theme: settingsStore.get('theme') as string | undefined,
      previewFont: settingsStore.get('previewFont') as string | undefined
    }
  })
  ipcMain.handle('file:pick', async (_e, title?: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: title || 'Link a file (PDF, image, …)',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const abs = result.filePaths[0]
    const root = getWorkspace()
    // Store a workspace-relative path when possible so the workspace stays portable.
    const path = root && abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs
    return { path, name: abs.split('/').pop() ?? abs }
  })
  /** Crude page count for diagnostics: Chromium writes a /Type /Page per page. */
  const countPdfPages = (data: Buffer | Uint8Array): number => {
    try {
      const text = Buffer.from(data).toString('latin1')
      const m = text.match(/\/Type\s*\/Page[^s]/g)
      return m ? m.length : 0
    } catch {
      return 0
    }
  }

  const logPrint = async (kind: string, marginIn: number, data: Buffer | Uint8Array): Promise<void> => {
    try {
      await appendFile(
        join(app.getPath('userData'), 'yestion.log'),
        `${new Date().toISOString()} [print] ${kind} margin=${marginIn}in bytes=${data.length} pages=${countPdfPages(data)}\n`,
        'utf-8'
      )
    } catch {
      /* ignore */
    }
  }

  // Same print path as the export, but returns the bytes — used by the live PDF
  // preview so what you see is the real pagination, not an approximation.
  ipcMain.handle('page:print-pdf', async (event, payload: { margins?: 'thin' | 'medium' | 'wide' }) => {
    const contents = event.sender
    try {
      await contents.executeJavaScript('document.fonts.ready.then(() => true)')
    } catch {
      /* fonts API unavailable — print anyway */
    }
    const marginIn = payload?.margins === 'thin' ? 0.28 : payload?.margins === 'wide' ? 0.95 : 0.55
    const data = await contents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      scale: 1,
      margins: { top: marginIn, bottom: marginIn, left: marginIn, right: marginIn }
    })
    await logPrint('preview', marginIn, data)
    return new Uint8Array(data)
  })

  ipcMain.handle(
    'page:export-pdf',
    async (
      event,
      payload: { title: string; relPath: string; margins?: 'thin' | 'medium' | 'wide' }
    ): Promise<{ path: string; pages: number } | null> => {
    const root = getWorkspace()
    if (!root) return null
    const abs = join(root, payload.relPath)
    const clean = payload.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'page'
    const defaultPath = join(dirname(abs), `${clean}.pdf`)
    let filePath = defaultPath
    if (!process.env.YESTION_EXPORT_PATH) {
      const res = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export to PDF',
        defaultPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (res.canceled || !res.filePath) return null
      filePath = res.filePath
    } else {
      filePath = process.env.YESTION_EXPORT_PATH
    }
    // Print the live window rather than a copy of the markup in a throwaway
    // page: there the inlined @font-face URLs (inside app.asar) don't resolve,
    // which broke font fallback and silently dropped every CJK glyph. The
    // renderer applies print styles that show only the page content.
    const contents = event.sender
    try {
      await contents.executeJavaScript('document.fonts.ready.then(() => true)')
    } catch {
      /* fonts API unavailable — print anyway */
    }
    await new Promise((r) => setTimeout(r, 250))
    // No scale factor: printToPDF ignores the window's zoom level, so the PDF
    // always comes out at the print stylesheet's own sizes (12pt body).
    // Margins in inches, chosen in the export popover.
    const marginIn =
      payload.margins === 'thin' ? 0.28 : payload.margins === 'wide' ? 0.95 : 0.55
    const data = await contents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      scale: 1,
      margins: { top: marginIn, bottom: marginIn, left: marginIn, right: marginIn }
    })
    await logPrint('export', marginIn, data)
    await fsp(filePath, data)
    return { path: filePath, pages: countPdfPages(data) }
    }
  )

  // File IPC accepts both workspace-relative and absolute paths, so files that
  // live outside the workspace (e.g. ~/Downloads) still open in the built-in
  // viewers instead of being handed to the system app.
  const resolveFile = (p: string): string | null => {
    if (p.startsWith('/')) return p
    const root = getWorkspace()
    return root ? join(root, p) : null
  }
  ipcMain.handle('file:kind', async (_e, p: string) => {
    const abs = resolveFile(p)
    if (!abs) return null
    try {
      return await fileKind(abs)
    } catch {
      return null
    }
  })
  ipcMain.handle('file:readText', async (_e, p: string) => {
    const abs = resolveFile(p)
    if (!abs) return null
    try {
      const content = await readTextFile(abs)
      return { content, absolutePath: abs }
    } catch {
      return null
    }
  })
  ipcMain.handle('file:writeText', async (_e, p: string, content: string) => {
    const abs = resolveFile(p)
    if (!abs) return false
    try {
      await writeTextFile(abs, content)
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('file:readBytes', async (_e, p: string) => {
    const abs = await resolveFile(p)
    if (!abs) return null
    try {
      const buf = await fsReadFile(abs)
      return new Uint8Array(buf)
    } catch {
      return null
    }
  })

  ipcMain.handle('file:readImage', async (_e, p: string) => {
    const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase()
    const mimes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml'
    }
    const mimeType = mimes[ext]
    if (!mimeType) return null
    const buf = await fsReadFile(p)
    return { data: buf.toString('base64'), mimeType, name: p.split('/').pop() ?? p }
  })
  ipcMain.handle('file:pickImage', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: 'Attach an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const p = result.filePaths[0]
    const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase()
    const mimes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp'
    }
    const mimeType = mimes[ext]
    if (!mimeType) return null
    const buf = await fsReadFile(p)
    return { data: buf.toString('base64'), mimeType, name: p.split('/').pop() ?? p }
  })
  ipcMain.handle('file:openPath', async (_e, p: string) => {
    return shell.openPath(p)
  })
  // Copy an image dropped/pasted into a page next to the page file, so pages
  // keep their assets in plain files (and inside private workspaces the write
  // goes through the vault's decrypted copy like any other edit).
  ipcMain.handle('file:importImage', async (_e, payload: { dir: string; name: string; mimeType?: string; data: string }) => {
    const root = getWorkspace()
    if (!root) return null
    const dir = payload.dir
    if (!dir.startsWith(root)) return null
    try {
      await fsAccess(dir)
    } catch {
      return null
    }
    const mimes: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
      'image/avif': '.avif'
    }
    const rawName = basename(payload.name || 'image')
    let ext = rawName.includes('.') ? rawName.slice(rawName.lastIndexOf('.')).toLowerCase() : ''
    if (!ext || ext.length > 6) ext = mimes[payload.mimeType ?? ''] ?? '.png'
    const base = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\- ]+/g, '_')
      // No spaces: they're legal in filenames but need escaping inside markdown
      // links, so keep new assets simple.
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim()
      .slice(0, 60) || 'image'
    let target = join(dir, base + ext)
    let n = 2
    while (true) {
      try {
        await fsAccess(target)
        target = join(dir, `${base}-${n}${ext}`)
        n++
      } catch {
        break
      }
    }
    await fsp(target, Buffer.from(payload.data, 'base64'))
    return { name: target.slice(dir.length + 1), path: target }
  })

  ipcMain.handle('file:reveal', async (_e, p: string) => {
    const abs = await resolveFile(p)
    if (abs) shell.showItemInFolder(abs)
    return true
  })
  ipcMain.handle('file:copyPath', async (_e, p: string) => {
    const abs = await resolveFile(p)
    if (abs) clipboard.writeText(abs)
    return abs
  })
  ipcMain.handle('dir:choose', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose a location',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  // ---- workspace switcher -------------------------------------------------
  ipcMain.handle('ws:list', async () => {
    await migrateWorkspaceList()
    return workspaceEntries()
  })

  ipcMain.handle('ws:addToList', async (_e, payload: { path: string; name?: string }) => {
    await migrateWorkspaceList()
    const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
    const isPrivate = await isVault(payload.path)
    let name = payload.name?.trim() || (payload.path.split('/').pop() ?? 'Workspace')
    if (isPrivate) name = (await readVaultConfig(payload.path))?.name || name.replace(/^\./, '').replace(/\.yestion$/, '')
    if (!list.some((w) => w.path === payload.path)) {
      list.push({ path: payload.path, name, kind: isPrivate ? 'private' : 'plain' })
      settingsStore.set('workspaces', list)
    }
    return workspaceEntries()
  })

  ipcMain.handle('ws:forget', async (_e, path: string) => {
    await migrateWorkspaceList()
    const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).filter((w) => w.path !== path)
    settingsStore.set('workspaces', list)
    return workspaceEntries()
  })

  ipcMain.handle('ws:create-workspace', async (_e, payload: { name: string; parentDir: string; private?: boolean; password?: string }) => {
    if (payload.private) {
      if (!payload.password) throw new VaultError('corrupt', 'A password is required.')
      const root = await createVault(payload.parentDir, payload.name, payload.password)
      const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
      if (!list.some((w) => w.path === root)) list.push({ path: root, name: payload.name.trim(), kind: 'private' })
      settingsStore.set('workspaces', list)
      await openVaultSession(root, payload.password)
      settingsStore.set('workspace', root)
      watchWorkspace(getWorkspace() as string)
      return root
    }
    const root = await createWorkspace(payload.parentDir, payload.name)
    const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
    if (!list.some((w) => w.path === root)) list.push({ path: root, name: payload.name.trim(), kind: 'plain' })
    settingsStore.set('workspaces', list)
    settingsStore.set('workspace', root)
    watchWorkspace(root)
    return root
  })

  // Unlock (or switch to) a private workspace.
  ipcMain.handle('ws:unlock', async (_e, payload: { path: string; password: string }) => {
    try {
      await closeVaultSession()
      const session = await openVaultSession(payload.path, payload.password)
      settingsStore.set('workspace', payload.path)
      watchWorkspace(session.workDir)
      // Silently skipping a file the user can't see is how vault data goes
      // "missing" with no explanation. Say which ones, and that they are safe.
      const warning =
        session.unreadable.length > 0
          ? `${session.unreadable.length} file${session.unreadable.length === 1 ? '' : 's'} could not be unlocked and ` +
            `left untouched: ${session.unreadable.slice(0, 5).join(', ')}` +
            (session.unreadable.length > 5 ? `, +${session.unreadable.length - 5} more` : '')
          : undefined
      return { ok: true, name: session.name, warning }
    } catch (err) {
      const code = err instanceof VaultError ? err.code : 'corrupt'
      return { ok: false, code, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ws:lock', async () => {
    if (!currentVault()) return { ok: true }
    await closeVaultSession()
    stopWatching()
    return { ok: true }
  })

  ipcMain.handle('ws:changePassword', async (_e, payload: { current: string; next: string }) => {
    const vault = currentVault()
    const root = vault?.root ?? (settingsStore.get('workspace') as string)
    if (!root) return { ok: false, message: 'No private workspace is open.' }
    try {
      await flushVault()
      const { changeVaultPassword } = await import('./vault')
      await changeVaultPassword(root, payload.current, payload.next)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('ws:switch', async (_e, path: string) => {
    if (await isVault(path)) return { ok: false, private: true, message: 'This workspace needs its password.' }
    await closeVaultSession()
    settingsStore.set('workspace', path)
    stopWatching()
    watchWorkspace(path)
    return { ok: true, private: false }
  })

  ipcMain.handle('ws:convert', async (_e, payload: { root: string; name?: string }) => {
    const root = await convertToWorkspace(payload.root, payload.name)
    const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
    if (!list.some((w) => w.path === root)) {
      list.push({ path: root, name: payload.name?.trim() || (root.split('/').pop() ?? 'Workspace'), kind: 'plain' })
      settingsStore.set('workspaces', list)
    }
    settingsStore.set('workspace', root)
    watchWorkspace(root)
    return root
  })
  ipcMain.handle('ws:open', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open a Yestion workspace',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
    const root = result.filePaths[0]
    const isPrivate0 = await isVault(root)
    if (isPrivate0) {
      const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
      if (!list.some((w) => w.path === root)) {
        list.push({ path: root, name: (await readVaultConfig(root))?.name || 'Private', kind: 'private' })
        settingsStore.set('workspaces', list)
      }
      return { ok: false, private: true, path: root }
    }
    const info = await validateWorkspace(root)
    if (!info) return { ok: false, error: 'Not a Yestion workspace. Create one instead (or convert this folder from the welcome screen).' }
    settingsStore.set('workspace', root)
    watchWorkspace(root)
    return { ok: true, path: root, name: info.name }
  })
  ipcMain.handle('ws:choose', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose Yestion workspace folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const isPrivate = await isVault(path)
    const list = ((settingsStore.get('workspaces') as WorkspaceEntry[] | undefined) ?? []).slice()
    if (!list.some((w) => w.path === path)) {
      const name = isPrivate
        ? (await readVaultConfig(path))?.name || (path.split('/').pop() ?? 'Workspace')
        : (path.split('/').pop() ?? 'Workspace')
      list.push({ path, name, kind: isPrivate ? 'private' : 'plain' })
      settingsStore.set('workspaces', list)
    }
    settingsStore.set('workspace', path)
    return path
  })
  ipcMain.handle('ws:tree', async () => {
    // The renderer always asks for the tree on boot and after every change;
    // this is the reliable moment to (re)start the file watcher, because
    // settings aren't loaded yet when the window is first created.
    ensureWatching(getWorkspace())
    const root = getWorkspace()
    if (!root) return []
    // The sidebar mirrors the LINKS inside pages; `treeMode: 'folders'` brings
    // back the plain folder listing.
    const mode = (settingsStore.get('treeMode') as string | undefined) ?? 'links'
    if (mode === 'folders') return listWorkspace(root)
    try {
      return await buildLinkTree(root)
    } catch (err) {
      console.error('[yestion] link tree failed, falling back to folders:', err)
      return listWorkspace(root)
    }
  })
  ipcMain.handle('ws:search', async (_e, query: string) => {
    const root = getWorkspace()
    if (!root) return []
    return searchWorkspace(root, query)
  })
  ipcMain.handle('ws:read', async (_e, relPath: string) => {
    const root = getWorkspace()
    if (!root) return null
    try {
      return await readPage(join(root, relPath), relPath)
    } catch (err) {
      // Switching workspace restores the tabs of the workspace you left; their
      // paths usually don't exist in the new one. "No such page" is an answer,
      // not a fault, and the renderer already skips null entries.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
      return null
    }
  })
  ipcMain.handle('ws:save', async (_e, payload: { relPath: string; title: string; icon: string; body: string }) => {
    const root = getWorkspace()
    if (!root) return false
    const abs = join(root, payload.relPath)
    let beforeBody = ''
    try {
      beforeBody = parsePageFile(await fsReadFile(abs, 'utf-8'), '').body
    } catch {
      /* new page */
    }
    await savePage(abs, payload.title, payload.icon, payload.body)
    // Removing a link exiles the page to bin/; adding one adopts it. Skipped in
    // encrypted workspaces (everything there is a ciphertext blob).
    if (!currentVault()) {
      try {
        const moves = await organizeAfterSave(root, payload.relPath, beforeBody, payload.body)
        if (moves.length > 0) {
          // The open tab may be one of the moved pages: the renderer remaps its
          // paths before saving again, so we never write to a stale location.
          for (const m of moves) {
            try {
              selfWrites.set(m.to, { body: readFileSync(join(root, m.to), 'utf-8'), at: Date.now() })
            } catch {
              /* ignore */
            }
          }
          mainWindow?.webContents.send('ws:page-moved', moves)
        }
      } catch (err) {
        console.error('[yestion] organizing after save failed:', err)
      }
    }
    // Remember the exact bytes so the watcher can tell this write apart from an
    // agent's edit to the same file.
    try {
      selfWrites.set(payload.relPath.replace(/\\/g, '/'), {
        body: readFileSync(abs, 'utf-8'),
        at: Date.now()
      })
    } catch {
      /* ignore */
    }
    return true
  })
  ipcMain.handle('ws:create', async (_e, payload: { parentRel: string | null; title: string }) => {
    const root = getWorkspace()
    if (!root) return null
    return createPage(root, payload.parentRel, payload.title)
  })
  ipcMain.handle('ws:convert-loose', async (_e, relPath: string) => {
    const root = getWorkspace()
    if (!root) return relPath
    return convertLoosePage(root, relPath)
  })
  ipcMain.handle('ws:delete', async (_e, relPath: string) => {
    const root = getWorkspace()
    if (!root) return false
    await deletePageOrFolder(join(root, relPath))
    return true
  })
  ipcMain.handle('ws:resolve-link', async (_e, linkText: string, fromDir?: string) => {
    const root = getWorkspace()
    if (!root) return null
    return resolvePageLink(root, linkText, fromDir)
  })
  ipcMain.handle('ws:all-pages', async () => {
    const root = getWorkspace()
    if (!root) return []
    return listAllPages(root)
  })
  ipcMain.handle('ws:reveal', async (_e, relPath: string) => {
    const root = getWorkspace()
    if (!root) return
    shell.showItemInFolder(join(root, relPath))
  })
  ipcMain.handle('ws:open-folder-in-finder', async () => {
    const root = getWorkspace()
    if (!root) return
    shell.openPath(root)
  })
}

// ---------------- IPC: agent ----------------

function registerAgentHandlers(): void {
  const send = (channel: string, payload: unknown): void => {
    mainWindow?.webContents.send(channel, payload)
  }

  let agentSettings: AgentSettings | null = null

  /** What the renderer needs to know about the live session. */
  const startPayload = (): { model: string; contextWindow: number | null; sessionFile: string | null } => ({
    model: agent?.modelLabel ?? '',
    contextWindow: agent?.contextWindow() ?? null,
    sessionFile: agent?.sessionFile() ?? null
  })

  const launch = async (root: string, settings: AgentSettings) => {
    if (agent) {
      await agent.dispose()
      agent = null
    }
    agentSettings = settings
    agent = await startAgentSession(
      root,
      { ...settings, thinkingLevel: (settingsStore.get('agentThinking') as string) || 'max' },
      app.getPath('userData'),
      (event) => {
        send('agent:event', event)
      }
    )
    const payload = startPayload()
    send('agent:started', payload)
    void logLine(`agent session ${settings.newSession ? 'new' : 'attach'} → ${payload.sessionFile ?? '(pending)'}`)
    return payload
  }

  const requireWorkspace = (): string => {
    if (currentVault()) {
      throw new Error('The agent is unavailable in private workspaces (their files are encrypted on disk).')
    }
    const root = getWorkspace()
    if (!root) throw new Error('Choose a workspace folder first')
    return root
  }

  ipcMain.handle('agent:start', async (_e, settings: AgentSettings) => {
    const root = requireWorkspace()
    // Same settings and a live session? Reuse it — restarting per message is
    // what made the agent forget the conversation.
    if (agent && agentSettings && JSON.stringify(agentSettings) === JSON.stringify(settings)) {
      const payload = startPayload()
      send('agent:started', payload)
      return payload
    }
    return launch(root, settings)
  })

  // Detach whatever is running and attach to one explicit conversation. Keeping
  // this in a single handler means the renderer never has to guess the agent's
  // state (a stop-then-start pair raced with in-flight prompts).
  ipcMain.handle('agent:resume', async (_e, settings: AgentSettings) => {
    const root = requireWorkspace()
    if (!settings.sessionFile) throw new Error('No conversation to resume')
    if (agent && agent.sessionFile() === settings.sessionFile) {
      const payload = startPayload()
      send('agent:started', payload)
      return payload
    }
    return launch(root, settings)
  })

  ipcMain.handle(
    'agent:prompt',
    async (
      _e,
      text: string,
      context?: { title: string; relPath: string } | null,
      images?: { data: string; mimeType: string }[]
    ) => {
      if (!agent) throw new Error('Agent is not running')
      const withContext = context && context.title
        ? `[User is viewing the page "${context.title}" (${context.relPath}) in Yestion right now.]\n\n${text}`
        : text
      await agent.prompt(withContext, images)
    }
  )

  ipcMain.handle('agent:sessions', async () => {
    const root = getWorkspace()
    if (!root) return []
    return listAgentSessions(root)
  })

  ipcMain.handle('agent:sessionMessages', async (_e, sessionPath: string) => {
    return readAgentSessionMessages(sessionPath)
  })

  ipcMain.handle('agent:sessionCurrent', async () => {
    return agent?.sessionFile() ?? null
  })

  // Native context menu for pages / PDFs / files in the sidebar and tab strip.
  ipcMain.handle('ui:itemMenu', async (event, payload: { relPath: string; kind: string; name?: string; isTab?: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!win) return
    const action = (a: string): void => send('item:action', { action: a, ...payload })
    // A blank tab has no file behind it: nothing to open, reveal or copy.
    if (payload.kind === 'new') {
      const blankItems: Electron.MenuItemConstructorOptions[] = [
        { label: 'Close Tab', click: () => action('close-tab') },
        { label: 'Close Other Tabs', click: () => action('close-others') }
      ]
      if (process.env.YESTION_MENU_DRY_RUN === '1') {
        console.log('[item-menu]', JSON.stringify(payload))
        return
      }
      const blankMenu = Menu.buildFromTemplate(blankItems)
      const blankWin = BrowserWindow.fromWebContents(event.sender)
      if (blankWin) blankMenu.popup({ window: blankWin })
      return
    }
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Open', click: () => action('open') },
      { label: 'Open in New Tab', click: () => action('new-tab') },
      { type: 'separator' },
      { label: 'Reveal in Finder', click: () => action('reveal') },
      { label: 'Copy Path', click: () => action('copy-path') }
    ]
    if (payload.kind === 'page') {
      items.push({ label: 'Copy Page Link', click: () => action('copy-link') })
    }
    if (payload.isTab) {
      items.push(
        { type: 'separator' },
        { label: 'Close Tab', click: () => action('close-tab') },
        { label: 'Close Other Tabs', click: () => action('close-others') }
      )
    }
    // Headless test path: YESTION_MENU_DRY_RUN=1 logs the payload instead of
    // opening a native popup, and YESTION_MENU_ACTION=<action> replays a menu
    // choice so the renderer-side handling can be exercised from a script.
    if (process.env.YESTION_MENU_DRY_RUN === '1') {
      console.log('[item-menu]', JSON.stringify(payload))
      const replay = process.env.YESTION_MENU_ACTION
      if (replay && replay !== 'none') send('item:action', { action: replay, ...payload })
      return
    }
    const menu = Menu.buildFromTemplate(items)
    const target = BrowserWindow.fromWebContents(event.sender)
    if (target) menu.popup({ window: target })
    else menu.popup({ window: win })
  })

  ipcMain.handle('agent:abort', async () => {
    await agent?.abort()
  })

  ipcMain.handle('agent:models', async () => {
    try {
      return await listAvailableModels()
    } catch (err) {
      return []
    }
  })

  // ---- providers & models (Yestion's own config) ----
  ipcMain.handle('providers:list', async () => listProviderStatus())
  ipcMain.handle('providers:save', async (_e, payload: { providers: ProviderConfig[] }) => {
    await saveProviders(payload.providers)
    // A changed provider/model set means new sessions must pick it up.
    return true
  })
  ipcMain.handle('providers:key', async (_e, payload: { id: string; key: string }) => {
    await setProviderKey(payload.id, payload.key)
    await writePiConfig()
    return true
  })
  ipcMain.handle('providers:test', async (_e, id: string) => testProvider(id))
  ipcMain.handle('providers:seed', async () => {
    const count = await importFromPi()
    if (count > 0) await writePiConfig()
    return count
  })
  ipcMain.handle('providers:ollama', async (_e, baseUrl: string) => listOllamaModels(baseUrl))
  ipcMain.handle('providers:testDraft', async (_e, draft: { baseUrl: string; api: string; key: string; modelId: string }) =>
    probeDraft(draft)
  )

  ipcMain.handle('agent:compact', async (_e, instructions?: string) => {
    const handle = getCurrentHandle()
    if (!handle) throw new Error('Agent is not running')
    return handle.compact(instructions)
  })

  ipcMain.handle('agent:thinking', async (_e, level: string) => {
    const handle = getCurrentHandle()
    if (!handle) throw new Error('Agent is not running')
    handle.setThinking(level)
    return true
  })

  ipcMain.handle('agent:restart', async () => {
    if (agent) {
      await agent.dispose()
      agent = null
    }
    return true
  })

  ipcMain.handle('agent:stop', async () => {
    if (agent) {
      await agent.dispose()
      agent = null
    }
    send('agent:stopped', true)
  })
}

app.on('before-quit', (event) => {
  if (!currentVault()) return
  event.preventDefault()
  void closeVaultSession().finally(() => {
    // Second pass through before-quit: no vault left, so this falls through.
    app.quit()
  })
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hacker.yestion')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWorkspaceHandlers()
  registerAgentHandlers()
  buildAppMenu(async () => {
    mainWindow = await createWindow()
  }, async (cmd: string) => {
    mainWindow?.webContents.send('menu-action', cmd)
  })

  // Renderer-side diagnostics land in a log file so failures in the app can be
  // read from a terminal (the window has no console attached).
  ipcMain.handle('app:log', async (_e, entry: { level?: string; message: string }) => {
    const level = entry.level === 'error' || entry.level === 'warn' ? entry.level : 'info'
    await logLine(entry.message, level)
    return true
  })

  ipcMain.handle('settings:get', (_e, key: string) => settingsStore.get(key as never))
  ipcMain.handle('settings:getAll', () => settingsStore.getAll())
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    settingsStore.set(key as never, value as never)
  })
  ipcMain.handle('settings:setMany', (_e, patch: Record<string, unknown>) => {
    settingsStore.setMany(patch as never)
  })

  void createWindow().then((w) => {
    mainWindow = w
    // Watch the workspace from launch: without this the app only noticed
    // external/agent edits after a workspace switch.
    ensureWatching(getWorkspace())
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow() as unknown
  }
})

// Imported for the zoom menu state (menu.ts shares zoomMenuState).
import { zoomMenuState } from './menu'
