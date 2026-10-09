// ---------------------------------------------------------------------------
// Link-derived workspace tree.
//
// In this model the sidebar mirrors the LINKS inside pages, not the folders on
// disk: a page's children are the pages it links to with [[Page Title]] (in the
// order they appear). The physical layout is kept in step on save — when a link
// is removed the page moves to <root>/bin/, and when a page is linked from
// somewhere else it moves under that page's folder — so what you see in the
// tree is also what you see in Finder.
//
// Everything that is not reachable through links lands under a "Bin" node, so
// nothing can disappear from the tree.
//
// This module is deliberately free of Electron imports so the logic can be
// exercised directly with node (see scripts/linktree-check.mjs).
// ---------------------------------------------------------------------------
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'

export interface TreeNode {
  name: string
  path: string
  relPath: string
  dirRel?: string
  kind: 'page' | 'folder' | 'pdf' | 'image' | 'file' | 'binary'
  title?: string
  icon?: string
  ext?: string
  children?: TreeNode[]
}

export const BIN_DIR = 'bin'
const INDEX = 'index.md'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.heic', '.tif', '.tiff'])

function fileIcon(ext: string): string {
  if (ext === '.pdf') return '📕'
  if (IMAGE_EXT.has(ext)) return '🖼'
  return '📄'
}

/** Front matter (title/icon) + body, without importing the workspace module. */
export function parsePage(text: string, fallbackTitle: string): { title: string; icon: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { title: fallbackTitle, icon: '', body: text }
  let title = fallbackTitle
  let icon = ''
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (kv[1] === 'title') title = v || title
    else if (kv[1] === 'icon') icon = v
  }
  return { title, icon, body: text.slice(m[0].length) }
}

/**
 * Link targets in a page body, in order of appearance.
 * - `[[Page Title]]`      → a page link
 * - `[[file:path]]`       → a file link (PDF, image, …)
 * Markdown links/images are intentionally ignored: a worksheet full of image
 * syntax is not a statement about where the page belongs.
 */
export function extractPageLinks(body: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const raw = m[1].trim()
    if (!raw || raw.startsWith('file:')) continue
    if (!out.includes(raw)) out.push(raw)
  }
  return out
}

export function extractFileLinks(body: string): string[] {
  const out: string[] = []
  const re = /\[\[file:([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const raw = m[1].trim()
    if (raw && !out.includes(raw)) out.push(raw)
  }
  return out
}

interface ScannedPage {
  /** Folder holding the page file (`''` at the workspace root). */
  dirRel: string
  /** True for `…/index.md` (the folder is the page); false for loose `x.md`. */
  isIndex: boolean
  /** Path of the page's markdown file, e.g. `Math/Trig/index.md`. */
  relPath: string
  abs: string
  name: string
  title: string
  icon: string
  links: string[]
  fileLinks: string[]
}

interface ScannedFile {
  dirRel: string
  relPath: string
  abs: string
  name: string
  kind: 'pdf' | 'image' | 'file' | 'binary'
  ext: string
}

interface Scan {
  pages: ScannedPage[]
  files: ScannedFile[]
  /** lower-cased title/folder/basename → page */
  byName: Map<string, ScannedPage>
}

async function scanWorkspace(root: string): Promise<Scan> {
  const pages: ScannedPage[] = []
  const files: ScannedFile[] = []

  const walk = async (dirRel: string, depth: number): Promise<void> => {
    if (depth > 12) return
    const abs = dirRel ? join(root, dirRel) : root
    let entries
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const childRel = dirRel ? `${dirRel}/${e.name}` : e.name
      if (e.isDirectory()) {
        await walk(childRel, depth + 1)
        continue
      }
      const ext = extname(e.name).toLowerCase()
      if (ext === '.md' || ext === '.markdown') {
        const absFile = join(abs, e.name)
        let text = ''
        try {
          text = await fs.readFile(absFile, 'utf-8')
        } catch {
          continue
        }
        const fallback = e.name.replace(/\.[^.]+$/, '')
        const parsed = parsePage(text, fallback)
        const isIndex = e.name.toLowerCase() === INDEX
        pages.push({
          dirRel,
          isIndex,
          relPath: childRel,
          abs: absFile,
          name: isIndex ? (dirRel.split('/').pop() || dirRel) : fallback,
          title: parsed.title,
          icon: parsed.icon,
          links: extractPageLinks(parsed.body),
          fileLinks: extractFileLinks(parsed.body)
        })
      } else {
        files.push({
          dirRel,
          relPath: childRel,
          abs: join(abs, e.name),
          name: e.name,
          kind: ext === '.pdf' ? 'pdf' : IMAGE_EXT.has(ext) ? 'image' : 'file',
          ext
        })
      }
    }
  }
  await walk('', 0)

  const byName = new Map<string, ScannedPage>()
  for (const p of pages) {
    const keys = [p.title, p.name, basename(p.dirRel || p.relPath.replace(/\.md$/, ''))]
    for (const k of keys) {
      const key = (k ?? '').trim().toLowerCase()
      if (key && !byName.has(key)) byName.set(key, p)
    }
  }
  return { pages, files, byName }
}

function pageNode(p: ScannedPage): TreeNode {
  return {
    name: p.name,
    path: p.abs,
    relPath: p.relPath,
    dirRel: p.isIndex ? p.dirRel : undefined,
    kind: 'page',
    title: p.title,
    icon: p.icon
  }
}

function fileNode(f: ScannedFile): TreeNode {
  return {
    name: f.name,
    path: f.abs,
    relPath: f.relPath,
    dirRel: f.dirRel,
    kind: f.kind,
    title: f.name,
    icon: f.kind === 'pdf' ? '📕' : fileIcon(f.ext),
    ext: f.ext
  }
}

/** Resolve a `[[link]]` (or a `[[file:…]]` path) to something in the workspace. */
function resolveLink(link: string, pages: Map<string, ScannedPage>, files: ScannedFile[]): ScannedPage | ScannedFile | null {
  const key = link.trim().toLowerCase()
  if (!key) return null
  const bare = key.replace(/\.md$/, '')
  const byTitle = pages.get(key) ?? pages.get(bare)
  if (byTitle) return byTitle
  // `[[folder/sub/page]]` or `[[file.pdf]]`
  const rel = link.trim().replace(/^\.\//, '')
  const file = files.find((f) => f.relPath.toLowerCase() === rel.toLowerCase() || f.name.toLowerCase() === rel.toLowerCase())
  if (file) return file
  const page = [...pages.values()].find(
    (p) => p.relPath.toLowerCase() === rel.toLowerCase() || p.relPath.toLowerCase() === `${rel}/index.md`.toLowerCase()
  )
  return page ?? null
}

function isPage(x: ScannedPage | ScannedFile): x is ScannedPage {
  return (x as ScannedPage).links !== undefined
}

/**
 * Build the sidebar tree from links.
 * Roots are the pages sitting at the top level of the workspace; their children
 * are the pages/files they link to, recursively (each node appears once, first
 * link wins, so cycles cannot loop). Anything unreachable — including
 * everything inside `bin/` — is collected under a "Bin" node.
 */
export async function buildLinkTree(root: string): Promise<TreeNode> {
  const scan = await scanWorkspace(root)

  const inBin = (rel: string): boolean => rel === BIN_DIR || rel.startsWith(`${BIN_DIR}/`)

  // A page is a root when it lives at the top level: a loose `notes.md` in the
  // workspace, or a page folder directly under it (`Topic/index.md`). A page
  // nested deeper appears under whoever links to it (or in the Bin).
  const isRootPage = (p: ScannedPage): boolean =>
    (p.isIndex ? !p.dirRel.includes('/') : p.dirRel === '') && !inBin(p.relPath)

  const buildChildren = (p: ScannedPage, seen: Set<string>): TreeNode[] => {
    const kids: TreeNode[] = []
    for (const link of p.links) {
      const target = resolveLink(link, scan.byName, scan.files)
      if (!target) continue
      const rel = target.relPath
      if (seen.has(rel)) continue
      seen.add(rel)
      if (isPage(target)) {
        const node = pageNode(target)
        node.children = buildChildren(target, seen)
        kids.push(node)
      } else {
        kids.push(fileNode(target))
      }
    }
    for (const link of p.fileLinks) {
      const target = scan.files.find(
        (f) => f.relPath.toLowerCase() === link.toLowerCase() || f.name.toLowerCase() === link.toLowerCase()
      )
      if (!target || seen.has(target.relPath)) continue
      seen.add(target.relPath)
      kids.push(fileNode(target))
    }
    return kids
  }

  const seen = new Set<string>()
  const roots: TreeNode[] = []

  // Root pages: pages at the top level (not inside bin/), in title order.
  const rootPages = scan.pages.filter(isRootPage).sort((a, b) => a.title.localeCompare(b.title))

  for (const p of rootPages) {
    seen.add(p.relPath)
    const node = pageNode(p)
    node.children = buildChildren(p, seen)
    roots.push(node)
  }

  // Everything unreachable: bin contents, orphan pages, unreferenced files.
  const binEntries: TreeNode[] = []
  for (const p of scan.pages) {
    if (seen.has(p.relPath)) continue
    seen.add(p.relPath)
    const node = pageNode(p)
    node.children = buildChildren(p, seen)
    binEntries.push(node)
  }
  // Unlinked attachments are deliberately NOT listed: this tree mirrors links,
  // so an image or PDF shows up when a page links it. They stay reachable via
  // the workspace search (⌘⇧F), and the agent can find them by name.
  binEntries.sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name))

  const tree: TreeNode = {
    name: root.split('/').pop() || 'Workspace',
    path: root,
    relPath: '',
    kind: 'folder',
    children: roots
  }
  if (binEntries.length > 0) {
    tree.children!.push({
      name: 'Bin',
      path: join(root, BIN_DIR),
      relPath: BIN_DIR,
      kind: 'folder',
      title: 'Bin',
      icon: '🗑',
      children: binEntries
    })
  }
  return tree
}

// ---------------------------------------------------------------------------
// Keeping the files in step with the links.
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function uniqueDir(parent: string, name: string): Promise<string> {
  let candidate = join(parent, name)
  let n = 2
  while (await exists(candidate)) {
    candidate = join(parent, `${name}-${n}`)
    n++
  }
  return candidate
}

export interface Move {
  /** Page path as the app knows it: `Math/Trig/index.md` (or `notes.md`). */
  from: string
  to: string
  /** Folder paths, for index pages only. */
  fromDir?: string
  toDir?: string
  reason: 'unlinked' | 'relinked'
}

/** Is `child` inside `parent` (both workspace-relative folder paths)? */
function isInside(child: string, parent: string): boolean {
  if (!parent) return !child.includes('/')
  return child.startsWith(`${parent}/`)
}

/**
 * Reconcile the disk layout with the links on the page that was just saved.
 *
 * - a page this page used to link and no longer does, and that nothing else
 *   links to, moves to `<root>/bin/…`
 * - a page this page newly links moves into this page's folder, so the tree and
 *   Finder agree
 *
 * Only page folders are moved, and never a page that another page also links to
 * (that would be ambiguous), and never into itself.
 */
export async function organizeAfterSave(
  root: string,
  savedRelPath: string,
  beforeBody: string,
  afterBody: string
): Promise<Move[]> {
  const scan = await scanWorkspace(root)
  const savedPage = scan.pages.find((p) => p.relPath === savedRelPath)
  if (!savedPage) return []
  const savedDir = savedPage.dirRel // '' for a loose top-level page
  const moves: Move[] = []

  // Who else links to a given page?
  const linkersOf = (target: ScannedPage): ScannedPage[] =>
    scan.pages.filter((p) => p.relPath !== target.relPath && p.links.some((l) => {
      const t = resolveLink(l, scan.byName, scan.files)
      return t ? t.relPath === target.relPath : false
    }))

  const before = new Set(extractPageLinks(beforeBody))
  const after = new Set(extractPageLinks(afterBody))

  // 1. Links that went away → unlink → move to bin (if nothing else links it).
  for (const link of before) {
    if (after.has(link)) continue
    const target = resolveLink(link, scan.byName, scan.files)
    if (!target || !isPage(target)) continue
    if (target.relPath === savedRelPath) continue
    // it must have been living under this page to be moved out of it
    if (!isInside(target.dirRel, savedDir) || target.dirRel === savedDir) continue
    if (linkersOf(target).length > 0) continue // still referenced elsewhere
    if (!target.isIndex) {
      // loose page: move the file itself into bin
      const binAbs = join(root, BIN_DIR)
      await fs.mkdir(binAbs, { recursive: true })
      const dest = await uniqueDir(binAbs, target.name)
      await fs.mkdir(dest, { recursive: true })
      await fs.rename(target.abs, join(dest, basename(target.relPath)))
      moves.push({
        from: target.relPath,
        to: `${BIN_DIR}/${basename(dest)}/${basename(target.relPath)}`,
        reason: 'unlinked'
      })
      continue
    }
    const binAbs = join(root, BIN_DIR)
    await fs.mkdir(binAbs, { recursive: true })
    const fromAbs = join(root, target.dirRel)
    const dest = await uniqueDir(binAbs, basename(fromAbs))
    await fs.rename(fromAbs, dest)
    moves.push({
      from: target.relPath,
      to: `${BIN_DIR}/${basename(dest)}/${INDEX}`,
      fromDir: target.dirRel,
      toDir: `${BIN_DIR}/${basename(dest)}`,
      reason: 'unlinked'
    })
  }

  // 2. New links → bring the page in under this one.
  for (const link of after) {
    if (before.has(link)) continue
    const target = resolveLink(link, scan.byName, scan.files)
    if (!target || !isPage(target)) continue
    if (target.relPath === savedRelPath) continue
    if (target.dirRel === savedDir || isInside(target.dirRel, savedDir)) continue // already here
    if (isInside(savedDir, target.dirRel)) continue // would nest into itself
    if (linkersOf(target).length > 1) continue // more than one parent: leave it put
    const parentAbs = savedDir ? join(root, savedDir) : root
    const loosePage = !target.isIndex
    if (loosePage) {
      const dest = await uniqueDir(parentAbs, target.name)
      await fs.mkdir(dest, { recursive: true })
      await fs.rename(target.abs, join(dest, basename(target.relPath)))
      moves.push({
        from: target.relPath,
        to: `${savedDir ? `${savedDir}/` : ''}${basename(dest)}/${basename(target.relPath)}`,
        reason: 'relinked'
      })
      continue
    }
    const fromAbs = join(root, target.dirRel)
    const dest = await uniqueDir(parentAbs, basename(fromAbs))
    await fs.rename(fromAbs, dest)
    moves.push({
      from: target.relPath,
      to: `${savedDir ? `${savedDir}/` : ''}${basename(dest)}/${INDEX}`,
      fromDir: target.dirRel,
      toDir: `${savedDir ? `${savedDir}/` : ''}${basename(dest)}`,
      reason: 'relinked'
    })
  }

  return moves
}
